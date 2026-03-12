// service-worker.js
/* eslint-disable no-undef */
/**
 * Teliya Service Worker — comportement contrôlé
 * - Precache app shell
 * - HTML: Network-First (+ navigation preload) avec fallback offline.html
 * - Assets: Stale-While-Revalidate
 * - Nettoyage caches
 * - **PAS** de mise à jour instantanée automatique
 */

const VERSION = 'v1.0.1'; // incrémente si tu changes les assets précachés
const STATIC_CACHE = `teliya-static-${VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/images/teliya-logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
  );

  // IMPORTANT : ne pas forcer l'activation automatique
  // self.skipWaiting(); <-- retiré volontairement pour éviter reloads auto
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    // NOTE : clients.claim() permettrait à la nouvelle SW de prendre le contrôle immédiatement
    // mais cela peut provoquer des reloads implicites dans certaines configurations. On le commente.
    // await self.clients.claim();

    // cleanup anciens caches
    const keys = await caches.keys();
    const deletions = keys
      .filter((k) => k.startsWith('teliya-static-') && k !== STATIC_CACHE)
      .map((k) => caches.delete(k));
    await Promise.all(deletions);
  })());
});

// fetch strategies identiques
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;

  const sameOrigin = url.origin === self.location.origin;
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML && sameOrigin) {
    event.respondWith(networkFirstHTML(event));
    return;
  }

  if (
    sameOrigin &&
    /\.(?:png|jpg|jpeg|webp|avif|svg|ico|gif|css|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // otherwise default
});

async function networkFirstHTML(event) {
  const preload = 'preloadResponse' in event ? event.preloadResponse : null;
  try {
    const preloaded = preload ? await preload : undefined;
    if (preloaded) {
      cacheHTML(event.request, preloaded.clone());
      return preloaded;
    }
    const fresh = await fetch(event.request);
    cacheHTML(event.request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const offline = await caches.match('/offline.html');
    if (offline) return offline;
    return new Response('<h1>Hors connexion</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200
    });
  }
}

async function cacheHTML(request, response) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response);
  } catch {}
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => {
      cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

/**
 * Lorsque le navigateur installe une nouvelle version du SW,
 * la nouvelle instance reste dans `waiting` tant que la page n'a pas demandé
 * explicitement l'activation. Ici on notifie les clients qu'une nouvelle version est prête.
 */
self.addEventListener('message', async (event) => {
  // On accepte un message explicite de type SKIP_WAITING s'il vient du client (optionnel).
  if (event?.data?.type === 'SKIP_WAITING') {
    await self.skipWaiting();
    return;
  }
});

// Lorsqu'une nouvelle version arrive, on essaie d'informer les clients.
// Note : ceci ne forçera pas le reload, ça permet juste au front d'afficher un toast.
self.addEventListener('updatefound', () => {
  // pas de code ici côté SW ; c'est la registration côté client qui capte l'updatefound
});
