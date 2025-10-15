/* eslint-disable no-undef */

/**
 * Teliya Service Worker — MAJ sur demande (aucun rafraîchissement imposé)
 * - App-shell précaché
 * - HTML: Network-First (+ navigation preload) avec fallback offline.html
 * - Assets: Stale-While-Revalidate
 * - Nettoyage des vieux caches
 * - NO auto refresh: pas de skipWaiting() ni clients.claim() automatiques
 */

const VERSION = 'v1.0.2';                    // ⬅️ change à chaque modif du SW
const STATIC_CACHE = `teliya-static-${VERSION}`;

const STATIC_ASSETS = [
  '/', // si le serveur renvoie index.html pour "/"
  '/images/teliya-logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/offline.html',
];

/* -------------------------- install: precache -------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  // ❌ NE PAS appeler self.skipWaiting() ici
});

/* --------- activate: cleanup + (optionnel) navigation preload ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }
    // ❌ NE PAS faire clients.claim() (évite un controllerchange immédiat)
    // nettoyage des anciens caches
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('teliya-static-') && k !== STATIC_CACHE)
        .map((k) => caches.delete(k))
    );
  })());
});

/* ------------------------------ fetch --------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) HTML / navigations
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML && sameOrigin) {
    event.respondWith(networkFirstHTML(event));
    return;
  }

  // 2) Assets (images/icônes/polices/css)
  if (
    sameOrigin &&
    /\.(?:png|jpg|jpeg|webp|avif|svg|ico|gif|css|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) le reste: laisser passer
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
      status: 200,
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

/* --------------- MAJ sur demande: message depuis la page --------------- */
/** Depuis l’app (bouton “Mettre à jour”):
 *   const reg = await navigator.serviceWorker.getRegistration();
 *   reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
 *   // La page NE se recharge pas ici tant que tu ne le fais pas toi-même.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting(); // active la nouvelle SW, sans reload automatique
  }
});
