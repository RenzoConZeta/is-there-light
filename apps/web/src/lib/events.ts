import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  getChargeEvents,
  initSchema,
  resolveDbPath,
  type GetChargeEventsParams,
} from "@app/db";
import type { ChargeEvent } from "@app/shared";

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
