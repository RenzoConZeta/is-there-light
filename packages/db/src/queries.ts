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

export function insertChargeEvent(params: InsertChargeEventParams): ChargeEvent {
  const db = getDb();
  const source = params.source || "collector";
  
  const stmt = db.prepare(
    "INSERT INTO charge_events (type, occurred_at, source) VALUES (?, ?, ?)"
  );
  const result = stmt.run(params.type, params.occurred_at, source);
  
  const getStmt = db.prepare("SELECT * FROM charge_events WHERE id = ?");
  const event = getStmt.get(result.lastInsertRowid) as ChargeEvent;
  
  return event;
}

export function getChargeEvents(params: GetChargeEventsParams = {}): ChargeEvent[] {
  const db = getDb();
  const limit = params.limit ?? 100;
  const offset = params.offset ?? 0;
  
  const stmt = db.prepare(
    "SELECT * FROM charge_events ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?"
  );
  const events = stmt.all(limit, offset) as ChargeEvent[];
  
  return events;
}