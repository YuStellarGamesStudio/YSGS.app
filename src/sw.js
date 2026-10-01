// Service worker. scripts/write-sw.mjs copies this file to dist/sw.js and fills in
// the build's shell files and their content hash; it is not bundled by Vite.
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

const SHELL_PREFIX = 'ysgs-shell-';
const SHELL = SHELL_PREFIX + VERSION;
const CATALOG = 'ysgs-catalog';
// The page passes its GameCatalog base, which is configurable at build time.
const catalogOrigin = new URL(new URL(location.href).searchParams.get('catalog') ?? 'https://data.ysgs.app/').origin;

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, so the shell never pairs a stale index.html
  // with this build's hashed assets.
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(SHELL_PREFIX) && key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === location.origin) {
    // Every view is index.html with a query string; offline, serve the cached shell.
    if (request.mode === 'navigate') {
      event.respondWith(fetch(request).catch(() => caches.match('/', { cacheName: SHELL }).then((hit) => hit ?? Response.error())));
    } else {
      event.respondWith(caches.match(request, { cacheName: SHELL }).then((hit) => hit ?? fetch(request)));
    }
  } else if (url.origin === catalogOrigin) {
    // Network first so catalog edits show up immediately; the last good copy covers offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(CATALOG).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => caches.match(request, { cacheName: CATALOG }).then((hit) => hit ?? Response.error())),
    );
  }
});
