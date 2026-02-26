// service-worker.js
// Minimal, robuste et explicite — pas d'auto-reload forcé.
// Le client décide quand appeler skipWaiting (via message { type: 'SKIP_WAITING' }).

const VERSION = 'v1.0.0'; // incrémente si tu changes STATIC_ASSETS
const STATIC_CACHE = `teliya-static-${VERSION}`;
const DYNAMIC_CACHE = `teliya-dynamic-${VERSION}`;

// Liste minimale d'assets à précacher (adapter si besoin).
const STATIC_ASSETS = [
  '/', // si ton serveur sert index.html à la racine
  '/index.html',
  '/offline.html',
  '/favicon.ico',
  '/images/teliya-logo.jpg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ------------- Helpers -------------
async function safeCachePut(cache, request, response) {
  // N'ajoute que des Response valides. Evite d'écrire undefined / opaque faillible.
  try {
    if (!response || !(response instanceof Response)) return;
    // Certains réponses cross-origin peuvent être opaque (status 0) mais valides — on peut choisir de les ignorer si on veut.
    // Ici on accepte les réponses ok et les réponses opaques (mode: no-cors) pour assets cross-origin.
    if (response.ok || response.type === 'opaque' || response.type === 'opaqueredirect') {
      await cache.put(request, response.clone());
    }
  } catch (err) {
    // ignore write failures
    console.warn('safeCachePut failed', err);
  }
}

async function fallbackToCache(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const match = await cache.match(request);
    if (match) return match;
    // sinon dynamique
    const dyn = await caches.open(DYNAMIC_CACHE);
    return dyn.match(request);
  } catch {
    return null;
  }
}

// Timeout helper pour network-first (optionnel)
function fetchWithTimeout(request, ms = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fetch-timeout')), ms);
    fetch(request)
      .then((r) => {
        clearTimeout(timer);
        resolve(r);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ------------- Install -------------
self.addEventListener('install', (event) => {
  // IMPORTANT : on ne fait PAS self.skipWaiting() ici pour éviter activation forcée.
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(STATIC_CACHE);
        await cache.addAll(STATIC_ASSETS.map((p) => new Request(p, { cache: 'reload' })));
      } catch (err) {
        // On ne veut pas faire planter l'installation si un asset manque
        console.warn('SW install - precache failed', err);
      }
    })()
  );
});

// ------------- Activate -------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Cleanup old caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      );

      // Claim clients so that controlled pages handle messages from SW (but not forcing reload)
      try {
        await self.clients.claim();
      } catch {}
    })()
  );
});

// ------------- Fetch strategy -------------
// - Navigations (HTML) : network-first (with preload) -> cache -> offline.html
// - Assets (css, images, fonts) : stale-while-revalidate
// - Others: pass through (with try/catch -> fallback cache)
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET or chrome extensions, devtools, data:, blob: etc.
  if (req.method !== 'GET') return;
  if (url.protocol.startsWith('chrome-extension')) return;
  if (url.protocol === 'data:' || url.protocol === 'blob:') return;

  const isSameOrigin = url.origin === self.location.origin;

  // detect navigation (SPA)
  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation && isSameOrigin) {
    event.respondWith(handleNavigationRequest(event));
    return;
  }

  // Static asset pattern: images / fonts / css / js (same-origin)
  if (
    isSameOrigin &&
    /\.(?:png|jpg|jpeg|webp|avif|svg|ico|gif|css|js|woff2?|ttf|eot)$/i.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidateStrategy(req));
    return;
  }

  // Default: try network then cache
  event.respondWith(
    fetch(req)
      .then((res) => {
        // update dynamic cache for GETs
        if (res && res.type !== 'opaque' && res.ok) {
          caches.open(DYNAMIC_CACHE).then((c) => safeCachePut(c, req, res));
        }
        return res;
      })
      .catch(async () => {
        const cached = await fallbackToCache(req);
        if (cached) return cached;
        // last resort
        return new Response('Service unavailable', { status: 503, statusText: 'Service unavailable' });
      })
  );
});

async function handleNavigationRequest(event) {
  // Optimize for navigation preload (if enabled in registration)
  let preloadResp = null;
  try {
    if (event.preloadResponse) {
      preloadResp = await event.preloadResponse;
      if (preloadResp) {
        // cache it optionally
        caches.open(STATIC_CACHE).then((c) => safeCachePut(c, event.request, preloadResp));
        return preloadResp;
      }
    }
  } catch (err) {
    // ignore preload errors
  }

  try {
    // Try network-first with a reasonable timeout
    const networkResponse = await fetchWithTimeout(event.request, 7000);
    // cache html in static cache
    try {
      const cache = await caches.open(STATIC_CACHE);
      safeCachePut(cache, event.request, networkResponse);
    } catch {}
    return networkResponse;
  } catch (err) {
    // network failed -> try cache
    const cached = await fallbackToCache(event.request);
    if (cached) return cached;

    // final fallback: offline page
    try {
      const cache = await caches.open(STATIC_CACHE);
      const offline = await cache.match('/offline.html') || cache.match('/index.html');
      if (offline) return offline;
    } catch {}
    return new Response('<h1>Hors connexion</h1>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      status: 200,
    });
  }
}

async function staleWhileRevalidateStrategy(request) {
  try {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    // fetch in background and update cache if possible
    const networkPromise = fetch(request)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          safeCachePut(cache, request, res);
        }
        return res;
      })
      .catch(() => null);
    // return cached immediately if available, else wait network
    return cached || (await networkPromise) || new Response(null, { status: 504, statusText: 'Gateway Timeout' });
  } catch (err) {
    return fetch(request).catch(() => new Response(null, { status: 504 }));
  }
}

// ------------- Messages from client -------------
// Supported messages:
// - { type: 'SKIP_WAITING' } -> skipWaiting() (client triggers when user confirms update)
// - { type: 'PING' } -> reply with { type: 'PONG', version }
self.addEventListener('message', (event) => {
  if (!event.data) return;
  const data = event.data;
  if (data.type === 'SKIP_WAITING') {
    // Client explicitly asked to activate new SW immediately
    self.skipWaiting().catch(() => {});
  } else if (data.type === 'PING') {
    event.source?.postMessage?.({ type: 'PONG', version: VERSION });
  }
});

// ------------- Notify clients when this SW becomes active -------------
// When a new service worker takes control (after skipWaiting + client reload/waiting clients),
// it is useful to inform clients that a new version is controlling them.
self.addEventListener('activate', (event) => {
  // Notify all clients the SW has activated (non-blocking)
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      for (const client of clients) {
        try {
          client.postMessage({ type: 'SW_ACTIVATED', version: VERSION });
        } catch {}
      }
    })()
  );
});
