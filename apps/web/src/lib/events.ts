import {
  getChargeEvents,
  initSchema,
  deleteChargeEvents,
  deleteChargeEventsBefore,
  type GetChargeEventsParams,
} from "@app/db";
import type { ChargeEvent } from "@app/shared";

let initialized: Promise<void> | null = null;

/** Inicializa el esquema una única vez por proceso (idempotente). */
function ensureDb(): Promise<void> {
  if (!initialized) {
    initialized = initSchema().catch((error: unknown) => {
      // Permite reintentar en la próxima petición si la inicialización falla.
      initialized = null;
      throw error;
    });
  }

  return initialized;
}

/** Lee el historial de eventos, más recientes primero. */
export async function listChargeEvents(
  params: GetChargeEventsParams = {}
): Promise<ChargeEvent[]> {
  await ensureDb();
  return getChargeEvents(params);
}

/**
 * Elimina los eventos indicados por id.
 *
 * Devuelve cuántos se borraron (puede ser menos de los solicitados si algún id
 * no existía).
 */
export async function removeChargeEvents(ids: number[]): Promise<number> {
  await ensureDb();
  return deleteChargeEvents({ ids });
}

/**
 * Elimina todos los eventos anteriores a una fecha.
 *
 * `before` puede ser cualquier fecha parseable por `Date`; se normaliza a ISO
 * UTC, que es el formato con el que se guarda `occurred_at`.
 */
export async function removeChargeEventsBefore(before: string): Promise<number> {
  await ensureDb();
  return deleteChargeEventsBefore({ before });
}
