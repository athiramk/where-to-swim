// Service worker: lets the app install and keep working offline with the last data it saw.
// - data.json and the page: network first (so you always get fresh conditions when online), cache as the fallback.
// - Built assets (hashed file names): cache first.
// Everything is relative to the service worker's own scope, so it works under a sub-path (e.g. /where-to-swim/).
const CACHE = "where-to-swim-v1";
const SCOPE = self.registration.scope; // e.g. https://example.com/where-to-swim/

self.addEventListener("install", (event) => {
  // Cache the shell so the app opens offline after the first visit. Failures here must not block install.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SCOPE, SCOPE + "manifest.webmanifest", SCOPE + "icons/icon-192.png"]))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// data.json is requested with a cache-busting ?t=... query; store and look it up without the query.
const keyFor = (url) => (url.pathname.endsWith("/data.json") ? new Request(url.origin + url.pathname) : null);

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put(cacheKey ?? request, fresh.clone());
    return fresh;
  } catch (err) {
    const cached = await cache.match(cacheKey ?? request, { ignoreSearch: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch other sites (BOM, EPA, ...)

  const dataKey = keyFor(url);
  if (dataKey) {
    event.respondWith(networkFirst(request, dataKey));
  } else if (request.mode === "navigate") {
    // Offline: fall back to the cached page for this scope.
    event.respondWith(networkFirst(request, new Request(SCOPE)));
  } else if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
