const CACHE_NAME = "electricity-cache-v2";

// Assets estáticos que se precargan en la instalación. El HTML de la app es
// SSR (dinámico), así que NO se precachea: se resuelve por red con fallback.
const PRECACHE_ASSETS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon-180.png",
  "/icons/badge-72.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/** ¿Es un asset estático cacheable de nuestro propio origen? */
function isCacheableAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  // El propio SW y el manifest de sesión nunca se cachean.
  if (url.pathname === "/sw.js") return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Solo cacheamos GET del mismo origen.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La API siempre va a la red: nunca servimos datos cacheados.
  if (url.pathname.startsWith("/api/")) return;

  // Navegación: network-first con fallback a caché y luego a la página offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const offline = await caches.match("/offline.html");
        return offline ?? Response.error();
      })
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  // Assets: stale-while-revalidate (sirve caché al instante y refresca en segundo plano).
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "Notificación", body: event.data.text() };
  }

  const title = data.title || "¿Hay electricidad?";
  const body = data.body || "";
  const tag = data.tag || "charge-event";
  const url = data.url || "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-72.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
