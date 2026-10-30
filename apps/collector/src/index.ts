import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { closeDb, initSchema, insertChargeEvent, resolveDbPath } from "@app/db";
import { notifyPlug, notifyUnplug } from "./notify.js";
import { detectPlatform, getStrategy, type Platform, type PowerStrategy } from "./platform.js";
import { getWasPlugged, onPowerChange, peekPending, pendingCount, shiftPending } from "./state.js";
import { resolveIntervalMs, startPolling } from "./powerPoller.js";
import { resolveDebounceMs, startWatching } from "./powerWatcher.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// `src/` y `dist/` cuelgan de apps/collector, así que la raíz queda 3 niveles arriba.
const REPO_ROOT = join(HERE, "..", "..", "..");

interface CollectorHandle {
  stop(): void;
}

function logInfo(message: string): void {
  console.log(`[collector] ${new Date().toISOString()} ${message}`);
}

function logWarn(message: string, error?: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : error;
  console.warn(`[collector] ${new Date().toISOString()} ${message}`, detail ?? "");
}

/** Carga `.env` desde el cwd y desde la raíz del repo, si existen. */
function loadEnvFiles(): void {
  for (const path of [join(process.cwd(), ".env"), join(REPO_ROOT, ".env")]) {
    if (!existsSync(path)) {
      continue;
    }

    try {
      process.loadEnvFile(path);
      logInfo(`.env cargado desde ${path}`);
    } catch (error) {
      logWarn(`No se pudo cargar ${path}`, error);
    }
  }
}

const SOURCE = "collector";

/** Backoff de reintento cuando la escritura a Turso falla (sin red). */
const BASE_RETRY_MS = 2_000;
const MAX_RETRY_MS = 30_000;

/** Evita que dos lecturas lancen escrituras simultáneas (una sola en vuelo). */
let flushing = false;
let retryDelayMs = BASE_RETRY_MS;
let retryTimer: NodeJS.Timeout | null = null;

function formatDelay(occurredAt: string): string {
  const elapsedMs = Date.now() - Date.parse(occurredAt);

  if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000) {
    return "sin retraso";
  }

  const seconds = Math.round(elapsedMs / 1_000);
  return seconds < 60 ? `${seconds} s de retraso` : `${Math.round(seconds / 60)} min de retraso`;
}

function scheduleRetry(): void {
  if (retryTimer) {
    return;
  }

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushPending();
  }, retryDelayMs);

  retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_MS);
}

/**
 * Vacía la cola de transiciones pendientes, de a una escritura por vez.
 *
 * Si Turso falla (típico cuando se corta internet junto con la luz), el evento
 * queda en la cola y se reintenta con backoff exponencial (2 s → 30 s). Nunca
 * hay dos `INSERT` en vuelo, así que no se generan duplicados ni notificaciones
 * repetidas. Los eventos ya registrados no se vuelven a insertar ni notificar.
 */
async function flushPending(): Promise<void> {
  // Una sola escritura en vuelo y backoff respetado: mientras haya un reintento
  // programado, las lecturas nuevas sólo encolan (no adelantan el intento).
  if (flushing || retryTimer) {
    return;
  }

  flushing = true;

  try {
    for (;;) {
      const pending = peekPending();

      if (!pending) {
        retryDelayMs = BASE_RETRY_MS;
        return;
      }

      const { inserted } = await insertChargeEvent({
        type: pending.type,
        occurred_at: pending.occurred_at,
        source: SOURCE,
      });

      shiftPending();
      retryDelayMs = BASE_RETRY_MS;

      if (!inserted) {
        logInfo(`Transición ${pending.type} ya registrada (${pending.occurred_at}); no se duplica ni se notifica`);
        continue;
      }

      logInfo(`Transición ${pending.type} registrada (${pending.occurred_at}, ${formatDelay(pending.occurred_at)})`);

      const notify = pending.type === "plug" ? notifyPlug : notifyUnplug;
      void notify(pending.occurred_at).catch((error) => {
        logWarn(`unexpected error in notify${pending.type === "plug" ? "Plug" : "Unplug"}`, error);
      });
    }
  } catch (error) {
    logWarn(
      `No se pudieron registrar ${pendingCount()} transición(es) pendientes; reintento en ${retryDelayMs} ms`,
      error
    );
    scheduleRetry();
  } finally {
    flushing = false;
  }
}

/** Registra la lectura: sólo encola cambios reales de estado y dispara el envío. */
function handleReading(plugged: boolean): void {
  const wasSynchronized = getWasPlugged() !== null;
  const transition = onPowerChange(plugged);

  if (transition) {
    logInfo(`Transición ${transition.type} detectada (plugged=${plugged}, ${transition.occurred_at})`);
  } else if (!wasSynchronized) {
    logInfo(`Estado inicial sincronizado: plugged=${plugged} (sin evento)`);
  }

  void flushPending();
}

/** Arranca la estrategia elegida, con polling como fallback si `fs.watch()` falla. */
function startCollecting(strategy: PowerStrategy): CollectorHandle {
  const onError = (error: unknown): void => logWarn("Error al leer el estado de energía", error);

  if (strategy === "watch") {
    try {
      return startWatching(handleReading, { onError });
    } catch (error) {
      logWarn("fs.watch() no está disponible; se continúa con polling", error);
    }
  }

  return startPolling(handleReading, { onError });
}

async function main(): Promise<void> {
  loadEnvFiles();

  let platform: Platform;
  let strategy: PowerStrategy;

  try {
    platform = detectPlatform();
    strategy = getStrategy(platform);
  } catch (error) {
    logWarn("No se puede detectar la energía en esta plataforma", error);
    process.exitCode = 1;
    return;
  }

  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  process.env.DB_PATH = dbPath;

  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();

  try {
    // Crea la tabla si falta (idempotente).
    await initSchema();
  } catch (error) {
    logWarn(`No se pudo inicializar la base de datos (${dbPath})`, error);
    process.exitCode = 1;
    return;
  }

  logInfo(tursoUrl ? `DB remota (Turso) lista` : `DB local lista en ${dbPath}`);
  logInfo(`Plataforma ${platform} ⇒ estrategia ${strategy}`);
  logInfo(
    `Config: COLLECTOR_INTERVAL_MS=${resolveIntervalMs()} ms, POWER_WATCH_DEBOUNCE_MS=${resolveDebounceMs()} ms`
  );

  const handle: CollectorHandle = startCollecting(strategy);

  const shutdown = (signal: string): void => {
    logInfo(`Señal ${signal}: deteniendo collector`);
    handle.stop();

    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    if (pendingCount() > 0) {
      logWarn(`${pendingCount()} transición(es) sin registrar; la cola en memoria se descarta al salir`);
    }

    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  logWarn("Error fatal del collector", error);
  process.exitCode = 1;
});
