import type { Row } from "@libsql/client";
import type { ChargeEvent, ChargeEventType } from "@app/shared";
import { getDb } from "./db.js";

export interface InsertChargeEventParams {
  type: ChargeEventType;
  occurred_at: string;
  source?: string;
}

export interface GetChargeEventsParams {
  limit?: number;
  offset?: number;
}

/** Normaliza una fila de libSQL al tipo compartido `ChargeEvent`. */
function toChargeEvent(row: Row): ChargeEvent {
  return {
    id: Number(row.id),
    type: String(row.type) as ChargeEventType,
    occurred_at: String(row.occurred_at),
    source: String(row.source),
    created_at: String(row.created_at),
  };
}

export async function insertChargeEvent(params: InsertChargeEventParams): Promise<ChargeEvent> {
  const db = getDb();
  const source = params.source || "collector";

  const result = await db.execute({
    sql: "INSERT INTO charge_events (type, occurred_at, source) VALUES (?, ?, ?)",
    args: [params.type, params.occurred_at, source],
  });

  const inserted = await db.execute({
    sql: "SELECT * FROM charge_events WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });

  return toChargeEvent(inserted.rows[0]);
}

export async function getChargeEvents(params: GetChargeEventsParams = {}): Promise<ChargeEvent[]> {
  const db = getDb();
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;

  const result = await db.execute({
    sql: "SELECT * FROM charge_events ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?",
    args: [limit, offset],
  });

  return result.rows.map(toChargeEvent);
}
