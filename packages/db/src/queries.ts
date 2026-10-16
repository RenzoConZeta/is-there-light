import type { Row } from "@libsql/client";
import type { ChargeEvent, ChargeEventType, PushSubscription } from "@app/shared";
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

export interface SavePushSubscriptionParams {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
}

export interface DeletePushSubscriptionParams {
  endpoint: string;
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

function toPushSubscription(row: Row): PushSubscription {
  return {
    endpoint: String(row.endpoint),
    p256dh: String(row.p256dh),
    auth: String(row.auth),
    user_agent: row.user_agent === null ? null : String(row.user_agent),
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

export async function savePushSubscription(params: SavePushSubscriptionParams): Promise<PushSubscription> {
  const db = getDb();

  await db.execute({
    sql: "INSERT OR REPLACE INTO push_subscriptions (endpoint, p256dh, auth, user_agent) VALUES (?, ?, ?, ?)",
    args: [params.endpoint, params.p256dh, params.auth, params.user_agent ?? null],
  });

  const result = await db.execute({
    sql: "SELECT * FROM push_subscriptions WHERE endpoint = ?",
    args: [params.endpoint],
  });

  if (result.rows.length === 0) {
    throw new Error("No se pudo guardar la suscripción push");
  }

  return toPushSubscription(result.rows[0]);
}

export async function listPushSubscriptions(): Promise<PushSubscription[]> {
  const db = getDb();
  const result = await db.execute({
    sql: "SELECT * FROM push_subscriptions ORDER BY created_at ASC",
  });

  return result.rows.map(toPushSubscription);
}

export async function deletePushSubscription(params: DeletePushSubscriptionParams): Promise<void> {
  const db = getDb();
  await db.execute({
    sql: "DELETE FROM push_subscriptions WHERE endpoint = ?",
    args: [params.endpoint],
  });
}
