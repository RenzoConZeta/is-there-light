import type { APIRoute } from "astro";
import { deletePushSubscription, initSchema } from "@app/db";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    await initSchema();
    const body = await request.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";

    if (!endpoint) {
      return new Response(JSON.stringify({ error: "endpoint requerido" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await deletePushSubscription({ endpoint });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/push/unsubscribe] Error:", error);
    return new Response(JSON.stringify({ error: "Error al eliminar suscripción" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
