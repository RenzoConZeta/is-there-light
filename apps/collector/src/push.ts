import { listPushSubscriptions } from "@app/db";
import webpush, { type PushSubscription as WebPushSubscription, type SendResult } from "web-push";

let vapidConfigured = false;

function configureVapid(): void {
  if (vapidConfigured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@local";

  if (!publicKey || !privateKey) {
    console.warn("[push] VAPID keys no configuradas; las notificaciones push no se enviarán");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

export async function sendPushNotification(title: string, body: string): Promise<void> {
  configureVapid();

  if (!vapidConfigured) {
    return;
  }

  const subscriptions = await listPushSubscriptions();
  if (subscriptions.length === 0) {
    return;
  }

  const payload = JSON.stringify({ title, body, tag: "charge-event", url: "/" });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushSub: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };
      try {
        await webpush.sendNotification(pushSub, payload);
      } catch (error: any) {
        // Si la suscripción ya no es válida, se podría eliminar; pero evitamos dependencias extra
        // Dejamos log para depuración
        console.warn("[push] Error enviando notificación a endpoint:", sub.endpoint, error?.statusCode || error?.message);
        // Opcional: eliminar si 404/410
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          try {
            const { deletePushSubscription } = await import("@app/db");
            await deletePushSubscription({ endpoint: sub.endpoint });
          } catch {
            // ignore
          }
        }
      }
    })
  );

  // results processed
}