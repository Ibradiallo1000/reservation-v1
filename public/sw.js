// public/sw.js
self.addEventListener('install', (event) => {
  // active immédiatement la nouvelle version
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // prend le contrôle de toutes les pages ouvertes
  event.waitUntil(clients.claim());
});

// Handler fetch (même pass-through) => nécessaire pour que la PWA soit installable
self.addEventListener('fetch', () => {});
