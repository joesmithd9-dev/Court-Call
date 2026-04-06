const CACHE_NAME = 'courtcall-v1';
const SNAPSHOT_CACHE = 'courtcall-snapshots';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SNAPSHOT_CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // SECURITY: Only cache PUBLIC snapshots for offline.
  // Never cache registrar or judge responses — they contain sensitive data
  // that must not persist on shared/public devices.
  if (url.pathname.includes('/public/court-days/') && !url.pathname.includes('/stream')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(SNAPSHOT_CACHE).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Network only for all other API calls (registrar, judge, mutations)
  if (url.pathname.startsWith('/v1')) {
    event.respondWith(fetch(event.request));
  } else {
    // Cache first for static assets
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
