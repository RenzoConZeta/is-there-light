import type { APIRoute } from "astro";
import { initSchema, savePushSubscription } from "@app/db";

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    await initSchema();
    const body = await request.json();

    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth : "";
    const user_agent = request.headers.get("user-agent");

    if (!endpoint || !p256dh || !auth) {
      return new Response(JSON.stringify({ error: "Datos de suscripción inválidos" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await savePushSubscription({ endpoint, p256dh, auth, user_agent });
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/push/subscribe] Error:", error);
    return new Response(JSON.stringify({ error: "Error al guardar suscripción" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
