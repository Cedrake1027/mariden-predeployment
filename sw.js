// Service Worker for Mariden Resort PWA
// Version 1.1.0

const STATIC_CACHE = "mariden-static-v1.1.0";
const HTML_CACHE = "mariden-html-v1.1.0";
const ASSET_CACHE = "mariden-assets-v1.1.0";
const HTML_CACHE_LIMIT = 50;
const ASSET_CACHE_LIMIT = 60;

// Critical assets cached on install. Guide HTML pages are not pre-listed —
// runtime caching covers them, and a stale list would brick install if a
// guide URL ever 404s.
const STATIC_ASSETS = [
  "/style.min.css",
  "/index.min.js",
  "/manifest.json",
  "/pay.html",
  "/images/general/mariden-logo.svg",
  "/images/general/mariden-fav.png",
  "/offline.html",
];

/**
 * Add assets one-by-one so a single 404 doesn't fail the entire install.
 * `cache.addAll` is atomic; `Promise.allSettled` is not.
 */
async function precacheStaticAssets() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(
    STATIC_ASSETS.map((url) =>
      cache
        .add(new Request(url, { cache: "reload" }))
        .catch((err) => console.warn(`[SW] Failed to precache ${url}:`, err)),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheStaticAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== HTML_CACHE && cacheName !== ASSET_CACHE && cacheName !== STATIC_CACHE) {
              return caches.delete(cacheName);
            }
            return null;
          }),
        ),
      )
      .catch((err) => console.warn("[SW] Cache cleanup error:", err))
      .then(() => self.clients.claim()),
  );
});

/**
 * Trim the runtime cache to a maximum number of entries (FIFO).
 */
async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  const excess = keys.length - max;
  for (let i = 0; i < excess; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== location.origin) return;
  if (url.pathname.includes("/webhook/")) return;

  const acceptHeader = request.headers.get("accept") || "";

  if (acceptHeader.includes("text/html")) {
    // HTML: network first, fall back to cache, then offline page.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            event.waitUntil(
              caches.open(HTML_CACHE).then((cache) => {
                cache.put(request, responseClone);
                return trimCache(HTML_CACHE, HTML_CACHE_LIMIT);
              })
            );
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("/offline.html")),
        ),
    );
  } else {
    // Assets: cache first.
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            event.waitUntil(
              caches.open(ASSET_CACHE).then((cache) => {
                cache.put(request, responseClone);
                return trimCache(ASSET_CACHE, ASSET_CACHE_LIMIT);
              })
            );
          }
          return response;
        });
      }).catch(() => new Response("", { status: 503, statusText: "Service Unavailable" }))
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
