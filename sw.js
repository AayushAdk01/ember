/* Ember service worker — 100% offline.
 * Every app-shell file is precached on install. All requests are served
 * cache-first, so the app opens instantly with Wi-Fi off / airplane mode.
 * When the server happens to be reachable, files are refreshed quietly in
 * the background. Bump VERSION whenever any file in ASSETS changes. */
const VERSION = "ember-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./favicon.ico",
  "./apple-touch-icon.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon-16.png"
];

const SCOPED = (u) => new URL(u, self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // cache: "reload" bypasses the HTTP cache so we never precache stale files.
    await cache.addAll(ASSETS.map((u) => new Request(new URL(u, self.registration.scope).href, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function refresh(request, cacheKey) {
  return fetch(request).then((res) => {
    if (res && res.ok && res.type === "basic") {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(cacheKey || request, copy));
    }
    return res;
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Any page navigation → the cached app shell. Never wait on the network.
    event.respondWith((async () => {
      const shell = (await caches.match(SCOPED("./index.html"))) || (await caches.match(SCOPED("./")));
      if (shell) {
        event.waitUntil(refresh(SCOPED("./index.html")).catch(() => {}));
        return shell;
      }
      return fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      event.waitUntil(refresh(req).catch(() => {}));
      return cached;
    }
    try {
      return await refresh(req);
    } catch (e) {
      return new Response("", { status: 504, statusText: "Offline" });
    }
  })());
});
