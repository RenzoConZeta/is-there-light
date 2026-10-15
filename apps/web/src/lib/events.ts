import { getChargeEvents, initSchema, type GetChargeEventsParams } from "@app/db";
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
