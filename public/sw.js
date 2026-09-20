const CACHE = "neon-hollow-dustline-__BUILD_VERSION__";
const SHELL = /* PRECACHE */ [];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("neon-hollow-") && key !== CACHE).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(new URL("index.html", self.registration.scope).href)));
    return;
  }
  // Hashed build assets are precached; never cache unknown responses or return HTML as JavaScript.
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
