// Kirana owner PWA service worker.
//
// Deliberately minimal + hand-rolled (no Workbox/Serwist build plugin) so it
// stays Turbopack-safe. Its main job is to satisfy the installability criteria
// (a registered SW with a fetch handler) and to give navigations a cached
// fallback when offline. It must NOT cache:
//   • /v1/*    — API + auth; always live
//   • /_next/* — build/HMR chunks; caching these breaks dev hot-reload
// so those are passed straight through to the network.

const CACHE = "kirana-owner-v1"
const SHELL = "/"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(SHELL)).catch(() => undefined),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/v1/") || url.pathname.startsWith("/_next/")) return

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit ?? caches.match(SHELL))),
    )
    return
  }

  if (request.destination === "image") {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
            return res
          }),
      ),
    )
  }
})
