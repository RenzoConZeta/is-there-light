export async function notifyPlug(occurredAt: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const enabled = process.env.TELEGRAM_ENABLED;

  if (enabled === "false" || enabled === "0") {
    return;
  }

  if (!token || !chatId) {
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const occurred = new Date(occurredAt);
    const text = `🔌 Volvió a cargar\n${occurred.toLocaleString()}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_notification: false,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[telegram] sendMessage failed ${res.status}: ${body}`);
      return;
    }

    console.log("[telegram] plug notification sent");
  } catch (err) {
    console.warn("[telegram] failed to send plug notification:", err);
  }
}
