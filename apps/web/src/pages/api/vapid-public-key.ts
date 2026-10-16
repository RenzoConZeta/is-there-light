import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return new Response(JSON.stringify({ error: "VAPID_PUBLIC_KEY no configurada" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ publicKey }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
