import type { APIRoute } from "astro";
import { listChargeEvents } from "../../lib/events.js";

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
