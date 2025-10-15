/* eslint-disable no-undef */

/**
 * Teliya Service Worker — simple & robuste
 * - App-shell léger précaché
 * - HTML: Network-First (+ navigation preload) avec fallback offline.html
 * - Assets (images/icônes/polices/css): Stale-While-Revalidate
 * - Nettoyage des vieux caches
 * - Mise à jour instantanée (skipWaiting via message)
 */

// ————————————————————————————————
// Version & caches
// ————————————————————————————————
const VERSION = 'v1.0.1'; // ⬅️ incrémente à chaque déploiement si tu modifies STATIC_ASSETS
const STATIC_CACHE = `teliya-static-${VERSION}`;

// App-shell minimal (80/20)
const STATIC_ASSETS = [
  '/', // SPA: si ton serveur renvoie index.html pour "/"
  '/images/teliya-logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/offline.html', // ⬅️ page de secours hors-ligne
];

// ————————————————————————————————
// Install: precache + skipWaiting
// ————————————————————————————————
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// ————————————————————————————————
// Activate: claim + cleanup + navigation preload
// ————————————————————————————————
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    await self.clients.claim();

    const keys = await caches.keys();
    const deletions = keys
      .filter((k) => k.startsWith('teliya-static-') && k !== STATIC_CACHE)
      .map((k) => caches.delete(k));
    await Promise.all(deletions);
  })());
});

// ————————————————————————————————
// Fetch strategies
// - HTML (navigate): Network-First (+preload) → cache → offline.html
// - Assets (images/icônes/polices/css): Stale-While-Revalidate
// - Others: pass-through
// ————————————————————————————————
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // On ne gère que GET
  if (req.method !== 'GET') return;

  // Même origine uniquement
  const sameOrigin = url.origin === self.location.origin;

  // 1) HTML navigations
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML && sameOrigin) {
    event.respondWith(networkFirstHTML(event));
    return;
  }

  // 2) Assets statiques
  if (
    sameOrigin &&
    /\.(?:png|jpg|jpeg|webp|avif|svg|ico|gif|css|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // 3) Par défaut: laisser le navigateur faire
});

// Network-First pour HTML (avec navigation preload + fallback offline.html)
async function networkFirstHTML(event) {
  const preload = 'preloadResponse' in event ? event.preloadResponse : null;

  try {
    // Réponse préchargée par le navigateur (si activée)
    const preloaded = preload ? await preload : undefined;
    if (preloaded) {
      cacheHTML(event.request, preloaded.clone());
      return preloaded;
    }

    // Sinon, fetch réseau
    const fresh = await fetch(event.request);
    cacheHTML(event.request, fresh.clone());
    return fresh;
  } catch {
    // Réseau KO → chercher en cache
    const cached = await caches.match(event.request);
    if (cached) return cached;

    // Dernier recours: page hors-ligne dédiée
    const offline = await caches.match('/offline.html');
    if (offline) return offline;

    // Si vraiment rien
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

// Stale-While-Revalidate pour assets
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
};
