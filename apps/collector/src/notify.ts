import { sendPushNotification } from "./push.js";

const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== "false";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim();
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID?.trim();

export async function notifyPlug(occurredAt: string): Promise<void> {
  const time = formatTime(occurredAt);
  const message = `🔌 Conectado a corriente\n${time}`;
  await Promise.allSettled([sendTelegram(message), sendPushNotification("Conectado a corriente", time)]);
}

export async function notifyUnplug(occurredAt: string): Promise<void> {
  const time = formatTime(occurredAt);
  const message = `🔋 Desconectado de corriente\n${time}`;
  await Promise.allSettled([sendTelegram(message), sendPushNotification("Desconectado de corriente", time)]);
}

async function sendTelegram(text: string): Promise<void> {
  if (!TELEGRAM_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram API error ${res.status}: ${body}`);
  }
}

function formatTime(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString("es-ES", { dateStyle: "medium", timeStyle: "medium" });
  } catch {
    return iso;
  }
}
