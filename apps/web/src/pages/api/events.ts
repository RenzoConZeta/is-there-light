import type { APIRoute } from "astro";
import { normalizeToIsoUtc } from "@app/db";
import { listChargeEvents, removeChargeEvents, removeChargeEventsBefore } from "../../lib/events.js";

export const prerender = false;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

/** Parsea un entero de query string acotado al rango [min, max]. */
function parseBoundedInt(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ url }) => {
  const limit = parseBoundedInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = parseBoundedInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  try {
    const events = await listChargeEvents({ limit, offset });
    return Response.json({ events });
  } catch (error) {
    console.error("[web] No se pudieron leer los eventos", error);
    return Response.json({ error: "No se pudieron leer los eventos" }, { status: 500 });
  }
};

/**
 * Borra eventos de `charge_events`.
 *
 * Acepta **exactamente uno** de los dos modos:
 *
 * - `{ "ids": [3, 7] }` → borra esos eventos concretos.
 * - `{ "before": "2026-01-01T00:00:00.000Z" }` → borra todos los anteriores a esa fecha.
 *
 * No existe "borrar todo" por HTTP: para eso está `pnpm db:reset`.
 */
export const DELETE: APIRoute = async ({ request, clientAddress }) => {
  let body: { ids?: unknown; before?: unknown };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Se esperaba un cuerpo JSON" }, 400);
  }

  const hasIds = Array.isArray(body.ids);
  const hasBefore = typeof body.before === "string" && body.before.trim() !== "";

  if (hasIds === hasBefore) {
    return json({ error: 'Indica "ids" o "before" (solo uno de los dos)' }, 400);
  }

  try {
    if (hasIds) {
      const ids = (body.ids as unknown[])
        .map((value) => (typeof value === "number" ? value : Number.parseInt(String(value), 10)))
        .filter((value) => Number.isSafeInteger(value) && value > 0);

      if (ids.length === 0) {
        return json({ error: "No se recibió ningún id válido" }, 400);
      }

      const deleted = await removeChargeEvents(ids);

      console.log(
        `[web] Borrados ${deleted} evento(s) por id desde ${clientAddress ?? "desconocido"}`
      );

      if (deleted === 0) {
        return json({ error: "No se encontraron eventos con esos ids" }, 404);
      }

      return json({ deleted, requested: ids.length });
    }

    const before = (body.before as string).trim();

    if (normalizeToIsoUtc(before) === null) {
      return json({ error: "Fecha inválida" }, 400);
    }

    const deleted = await removeChargeEventsBefore(before);

    console.log(
      `[web] Borrados ${deleted} evento(s) anteriores a ${before} desde ${clientAddress ?? "desconocido"}`
    );

    return json({ deleted });
  } catch (error) {
    console.error("[web] No se pudieron borrar los eventos", error);
    return json({ error: "No se pudieron borrar los eventos" }, 500);
  }
};
