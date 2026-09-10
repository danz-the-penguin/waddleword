const CACHE_NAME = 'waddleword-v1';

// Explicitly cache massive binary models and worker scripts
const ASSETS_TO_CACHE = [
  '/gaddag_nwl2023.bin',
  '/gaddag_csw24.bin',
  '/synergy.json',
  '/synergy_trained.json',
  '/dictionary_compact.json',
  '/mc_simulator.wgsl',
  '/solverWorker.js',
  '/dictionaryWorker.js'
];

self.addEventListener('install', (event) => {
  // PWA Strategy: Pre-cache core heavy assets during installation so they are available offline.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // PWA Caching Strategy:
  // For massive static binary files, dictionary JSONs, WGSL shaders, and Worker scripts,
  // use Cache-First, falling back to Network.
  // This guarantees instant offline availability and bypasses Vercel edge latency.
  if (
    url.pathname.endsWith('.bin') || 
    url.pathname.endsWith('.wgsl') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('Worker.js')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
  } else {
    // For HTML, page data, and general API routes, use Network-First, falling back to Cache.
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          // Cache successful responses
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
             const responseToCache = networkResponse.clone();
             caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request);
        })
    );
  }
});
