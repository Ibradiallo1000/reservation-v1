/* eslint-disable no-undef */

/**
 * Teliya Service Worker — anti-rafraîchissement automatique
 * - App-shell précaché (offline OK)
 * - HTML: Network-First (+ navigation preload) avec fallback offline.html
 * - Assets (images/icônes/polices/css): Stale-While-Revalidate
 * - Nettoyage des vieux caches
 * - ❗️Pas de skipWaiting/clients.claim automatiques ⇒ pas de reload auto
 * - MAJ uniquement si l’app envoie {type:'SKIP_WAITING'} (manuel)
 */

// ————————————————————————————————
// Version & caches
// ————————————————————————————————
const VERSION = 'v1.0.2'; // incrémente si tu changes STATIC_ASSETS
const STATIC_CACHE = `teliya-static-${VERSION}`;

// App-shell minimal
const STATIC_ASSETS = [
  '/', // SPA: si ton serveur renvoie index.html pour "/"
  '/images/teliya-logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/offline.html',
];

// ————————————————————————————————
// Install: precache (❌ pas de skipWaiting automatique)
// ————————————————————————————————
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  // ❌ on NE fait PAS self.skipWaiting() ici pour éviter le basculement auto
});

// ————————————————————————————————
// Activate: cleanup + navigation preload (❌ pas de clients.claim())
// ————————————————————————————————
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch {}
    }

    // ❌ pas de clients.claim() => pas de controllerchange forcé côté clients

    const keys = await caches.keys();
    const deletions = keys
      .filter((k) => k.startsWith('teliya-static-') && k !== STATIC_CACHE)
      .map((k) => caches.delete(k));
    await Promise.all(deletions);
  })());
});

// ————————————————————————————————
// Fetch
// ————————————————————————————————
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  const sameOrigin = url.origin === self.location.origin;

  // HTML navigations
  const isHTML =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML && sameOrigin) {
    event.respondWith(networkFirstHTML(event));
    return;
  }

  // Assets statiques : SWR
  if (
    sameOrigin &&
    /\.(?:png|jpg|jpeg|webp|avif|svg|ico|gif|css|woff2?)$/i.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }
});

// Network-First pour HTML (avec navigation preload + fallback offline.html)
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
}

// ————————————————————————————————
// Mise à jour MANUELLE uniquement
// L’app peut appeler: reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
// ————————————————————————————————
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Ici on accepte la nouvelle version uniquement si l’app le demande.
    self.skipWaiting();
  }
});
