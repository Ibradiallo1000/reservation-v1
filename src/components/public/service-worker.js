// public/service-worker.js
// SW minimal, réseau-d'abord pour HTML + activation immédiate.

const CACHE_NAME = 'app-cache-v1';

self.addEventListener('install', (event) => {
  // Installation rapide
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Nettoie anciens caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim(); // prend la main immédiatement
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Réseau-d'abord pour les navigations HTML => capte vite les nouvelles versions
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const isHtml =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHtml) {
    event.respondWith(
      (async () => {
        try {
          // Essaye le réseau en priorité (et sans cache)
          const fresh = await fetch(req, { cache: 'no-store' });
          return fresh;
        } catch (e) {
          // Fallback offline
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match('/index.html');
          return cached || new Response('Offline', { status: 503 });
        }
      })()
    );
  }
});
