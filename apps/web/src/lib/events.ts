import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { getChargeEvents, initSchema, type GetChargeEventsParams } from "@app/db";
import type { ChargeEvent } from "@app/shared";

const DB_FILENAME = "charge.db";
const DATA_DIR = "data";

/**
 * Sube desde `start` hasta encontrar la raíz del monorepo (marcada por
 * `pnpm-workspace.yaml`). pnpm ejecuta los scripts con cwd en el paquete, por lo
 * que sin esto `./data/charge.db` apuntaría a `apps/web/data` en lugar de
 * compartir el archivo con el collector.
 */
function findRepoRoot(start: string): string {
  let dir = start;

  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }

    dir = parent;
  }
}

/** Ruta al SQLite compartido: `DB_PATH` si está definido, si no `<repo>/data/charge.db`. */
export function resolveDbPath(): string {
  const configured = process.env.DB_PATH?.trim();
  return configured ? configured : join(findRepoRoot(process.cwd()), DATA_DIR, DB_FILENAME);
}

let initialized = false;

/** Inicializa la conexión y el esquema una única vez por proceso. */
function ensureDb(): void {
  if (initialized) {
    return;
  }

  const dbPath = resolveDbPath();
  mkdirSync(dirname(dbPath), { recursive: true });
  process.env.DB_PATH = dbPath;

  initSchema();
  initialized = true;
}

/** Lee el historial de eventos, más recientes primero. */
export function listChargeEvents(params: GetChargeEventsParams = {}): ChargeEvent[] {
  ensureDb();
  return getChargeEvents(params);
}
