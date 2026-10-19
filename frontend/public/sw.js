/* Service worker for Track.
 *
 * Scope is deliberately narrow. The shell is cached so the installed app opens
 * instantly and without a network, and nothing under /api is ever cached — a
 * stale streak shown as current would be worse than an error, and a cached
 * response could survive a sign-out.
 *
 * CACHE must change whenever the shell changes. Vite fingerprints the assets,
 * so the only file this really protects is index.html, which the backend already
 * serves with no-cache.
 */

const CACHE = "track-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      // A failed pre-cache must not block activation; the fetch handler falls
      // back to the network anyway.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache the API, and never serve it from a cache.
  if (url.pathname.startsWith("/api/")) return;

  // Navigations: network first so a deploy is picked up, cache as the fallback
  // so the app still opens with no signal.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Fingerprinted assets: cache first, since their contents can never change
  // under a given URL.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
