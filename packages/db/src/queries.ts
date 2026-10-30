import type { Row } from "@libsql/client";
import type { ChargeEvent, ChargeEventType, PushSubscription } from "@app/shared";
import { getDb } from "./db.js";

export interface InsertChargeEventParams {
  type: ChargeEventType;
  occurred_at: string;
  source?: string;
}

export interface InsertChargeEventResult {
  event: ChargeEvent;
  /** `true` si la fila se creó en esta llamada; `false` si ya existía. */
  inserted: boolean;
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

export interface DeleteChargeEventParams {
  id: number;
}

export interface DeleteChargeEventsParams {
  /** Ids de los eventos a eliminar. */
  ids: number[];
}

export interface DeleteChargeEventsBeforeParams {
  /** Fecha límite (ISO 8601). Se borran los eventos anteriores a ella. */
  before: string;
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

/**
 * Inserta un evento sólo si no existe ya uno con el mismo `type` y `occurred_at`.
 *
 * La comprobación va dentro de la misma sentencia (`WHERE NOT EXISTS`), así que
 * dos intentos concurrentes (p. ej. reintentos tras un corte de red) no pueden
 * crear filas duplicadas. Es idempotente **sin** índice único ni cambios de
 * esquema en `charge_events`.
 *
 * Devuelve el evento y si esta llamada lo insertó (`inserted`), para poder
 * omitir notificaciones repetidas cuando el evento ya estaba registrado.
 */
export async function insertChargeEvent(params: InsertChargeEventParams): Promise<InsertChargeEventResult> {
  const db = getDb();
  const source = params.source || "collector";

  const result = await db.execute({
    sql: `INSERT INTO charge_events (type, occurred_at, source)
          SELECT ?, ?, ?
          WHERE NOT EXISTS (
            SELECT 1 FROM charge_events WHERE type = ? AND occurred_at = ?
          )`,
    args: [params.type, params.occurred_at, source, params.type, params.occurred_at],
  });

  if (result.rowsAffected === 0) {
    const existing = await db.execute({
      sql: "SELECT * FROM charge_events WHERE type = ? AND occurred_at = ?",
      args: [params.type, params.occurred_at],
    });

    if (existing.rows.length === 0) {
      throw new Error(`No se pudo insertar ni encontrar el evento ${params.type}@${params.occurred_at}`);
    }

    return { event: toChargeEvent(existing.rows[0]), inserted: false };
  }

  const inserted = await db.execute({
    sql: "SELECT * FROM charge_events WHERE id = ?",
    args: [Number(result.lastInsertRowid)],
  });

  return { event: toChargeEvent(inserted.rows[0]), inserted: true };
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

/**
 * Normaliza una fecha a ISO 8601 en UTC.
 *
 * `occurred_at` se guarda siempre con `toISOString()`, así que compararlo
 * lexicográficamente contra otro ISO UTC equivale a compararlo cronológicamente.
 * Devuelve `null` si la fecha no es parseable.
 */
export function normalizeToIsoUtc(value: string): string | null {
  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

/** Elimina un evento por id. Devuelve `true` si se borró alguna fila. */
export async function deleteChargeEvent(params: DeleteChargeEventParams): Promise<boolean> {
  const db = getDb();

  const result = await db.execute({
    sql: "DELETE FROM charge_events WHERE id = ?",
    args: [params.id],
  });

  return result.rowsAffected > 0;
}

/**
 * Elimina varios eventos por id en una sola sentencia.
 *
 * Devuelve el número de filas borradas (puede ser menor que `ids.length` si
 * algún id no existía).
 */
export async function deleteChargeEvents(params: DeleteChargeEventsParams): Promise<number> {
  if (params.ids.length === 0) {
    return 0;
  }

  const db = getDb();
  const placeholders = params.ids.map(() => "?").join(", ");

  const result = await db.execute({
    sql: `DELETE FROM charge_events WHERE id IN (${placeholders})`,
    args: [...params.ids],
  });

  return result.rowsAffected;
}

/**
 * Elimina todos los eventos anteriores a una fecha (ISO 8601).
 *
 * Devuelve el número de filas borradas. Lanza si la fecha no es válida.
 */
export async function deleteChargeEventsBefore(
  params: DeleteChargeEventsBeforeParams
): Promise<number> {
  const before = normalizeToIsoUtc(params.before);

  if (before === null) {
    throw new Error(`Fecha inválida: ${params.before}`);
  }

  const db = getDb();

  const result = await db.execute({
    sql: "DELETE FROM charge_events WHERE occurred_at < ?",
    args: [before],
  });

  return result.rowsAffected;
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
