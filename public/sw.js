const VAIVIA_STATIC_CACHE = "vaivia-static-v1";
const VAIVIA_ICON_ASSETS = [
  "/vaivia-icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(VAIVIA_STATIC_CACHE)
      .then((cache) => cache.addAll(VAIVIA_ICON_ASSETS))
      .catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (cacheName) =>
                cacheName.startsWith("vaivia-") &&
                cacheName !== VAIVIA_STATIC_CACHE
            )
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;
  if (!VAIVIA_ICON_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(request).then((networkResponse) => {
        const responseClone = networkResponse.clone();
        caches
          .open(VAIVIA_STATIC_CACHE)
          .then((cache) => cache.put(request, responseClone))
          .catch(() => undefined);

        return networkResponse;
      });
    })
  );
});
