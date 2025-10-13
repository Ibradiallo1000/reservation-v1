/* eslint-disable no-undef */

// ⚙️ versionne le cache à chaque déploiement
const APP_VERSION = 'v1.0.3';
const CACHE_NAME = `teliya-${APP_VERSION}`;

// 🔒 n’essaie JAMAIS de gérer des schémas non http(s)
const isHttp = (reqOrUrl) => {
  const url = typeof reqOrUrl === 'string' ? reqOrUrl : reqOrUrl.url;
  return url.startsWith('http://') || url.startsWith('https://');
};

// 📦 fichiers “app shell” optionnels à pré-cacher (tu peux compléter)
const PRECACHE_URLS = [
  '/',                      // shell
  '/index.html',
  '/manifest.webmanifest',
  '/images/hero-fallback.jpg',
  '/images/teliya-logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// 🧩 INSTALL — pré-cache en filtrant les URLs non http(s)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const toCache = PRECACHE_URLS.filter(isHttp); // sécurité
      try {
        await cache.addAll(toCache);
      } catch (e) {
        // En dev, certaines ressources peuvent manquer: on ignore
        console.warn('[SW] Precache warning:', e);
      }
    }).then(() => self.skipWaiting())
  );
});

// 🧹 ACTIVATE — supprime les vieux caches et prend la main
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
      );
      await self.clients.claim();
    })()
  );
});

// 🔁 FETCH — stratégie:
// - Navigations/documents: Network-First (offline fallback sur cache)
// - GET same-origin: Stale-While-Revalidate
// - Tout le reste: laisse passer (network)
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 🚫 On n'intercepte pas:
  // - non-HTTP(S) (ex: chrome-extension://)
  // - méthodes ≠ GET
  if (!isHttp(request) || request.method !== 'GET') return;

  const url = new URL(request.url);
  const isNavigation = request.mode === 'navigate';

  // 📄 Pages / navigations → Network First
  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          // clone avant mise en cache
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          // fallback vers index pour SPA si page non trouvée dans le cache
          return cached || caches.match('/index.html');
        }
      })()
    );
    return;
  }

  // 🏠 Même origine → Stale-While-Revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((resp) => {
            // On n’essaie pas de mettre en cache les réponses opaques / invalides
            if (resp && resp.status === 200 && resp.type === 'basic') {
              cache.put(request, resp.clone());
            }
            return resp;
          })
          .catch(() => undefined);

        // Renvoie le cache immédiatement si dispo, sinon réseau
        return cached || networkPromise || fetch(request);
      })()
    );
    return;
  }

  // 🌍 Cross-origin → Network First simple (pas de cache de chrome-extension, etc.)
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        // offline: tente une version en cache si elle existe
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});

// ✉️ Support “SKIP_WAITING” envoyé depuis l’app
self.addEventListener('message', (event) => {
  if (event?.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
