import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { closeDb, initSchema, insertChargeEvent } from "@app/db";
import { detectPlatform, getStrategy, type Platform, type PowerStrategy } from "./platform.js";
import { getWasPlugged, onPowerChange } from "./state.js";
import { resolveIntervalMs, startPolling } from "./powerPoller.js";
import { resolveDebounceMs, startWatching } from "./powerWatcher.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// `src/` y `dist/` cuelgan de apps/collector, así que la raíz queda 3 niveles arriba.
const REPO_ROOT = join(HERE, "..", "..", "..");

const SOURCE = "collector";

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

/**
 * Resuelve el archivo SQLite. Si `DB_PATH` no está definido se usa el default
 * del AGENTS.md (`./data/charge.db`) pero anclado a la raíz del repo: pnpm
 * ejecuta los scripts con cwd en el paquete, y web y collector deben compartir
 * el mismo archivo.
 */
function resolveDbPath(): string {
  const configured = process.env.DB_PATH?.trim();
  return configured ? configured : join(REPO_ROOT, "data", "charge.db");
}

/** Registra la lectura: sólo persiste cambios reales de estado. */
function handleReading(plugged: boolean): void {
  const alreadySynchronized = getWasPlugged() !== null;

  try {
    const transition = onPowerChange(plugged, (type) => {
      insertChargeEvent({
        type,
        occurred_at: new Date().toISOString(),
        source: SOURCE,
      });
    });

    if (transition) {
      logInfo(`Transición ${transition} registrada (plugged=${plugged})`);
    } else if (!alreadySynchronized) {
      logInfo(`Estado inicial sincronizado: plugged=${plugged} (sin evento)`);
    }
  } catch (error) {
    logWarn(`No se pudo registrar la transición (plugged=${plugged})`, error);
  }
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

function main(): void {
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

  try {
    // Crea la tabla si falta y activa WAL (ver packages/db).
    initSchema();
  } catch (error) {
    logWarn(`No se pudo inicializar la base de datos en ${dbPath}`, error);
    process.exitCode = 1;
    return;
  }

  logInfo(`DB lista en ${dbPath}`);
  logInfo(`Plataforma ${platform} ⇒ estrategia ${strategy}`);
  logInfo(
    `Config: COLLECTOR_INTERVAL_MS=${resolveIntervalMs()} ms, POWER_WATCH_DEBOUNCE_MS=${resolveDebounceMs()} ms`
  );

  const handle: CollectorHandle = startCollecting(strategy);

  const shutdown = (signal: string): void => {
    logInfo(`Señal ${signal}: deteniendo collector`);
    handle.stop();
    closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main();
