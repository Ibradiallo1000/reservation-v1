/// <reference lib="webworker" />

// Déclaration du scope global pour TypeScript
declare const self: ServiceWorkerGlobalScope & typeof globalThis;

// Workbox injectera automatiquement cette constante
declare const __WB_MANIFEST: Array<any>;

import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate, NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

// ⚡️ Cache des fichiers générés par le build
// @ts-ignore : Workbox injecte __WB_MANIFEST
precacheAndRoute(__WB_MANIFEST || []);

// ⚡️ Cache Firestore (lecture offline)
registerRoute(
  ({ url }) => url.origin.includes("firestore.googleapis.com"),
  new NetworkFirst({
    cacheName: "firestore-cache",
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 24 heures
      }),
    ],
  })
);

// ⚡️ Cache des images
registerRoute(
  ({ request }) => request.destination === "image",
  new CacheFirst({
    cacheName: "images-cache",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 jours
      }),
    ],
  })
);

// ✅ Gestion des mises à jour du SW
self.addEventListener("install", () => {
  console.log("✅ Service Worker installé !");
});

self.addEventListener("activate", () => {
  console.log("✅ Service Worker activé !");
});

self.addEventListener("message", (event: ExtendableMessageEvent) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
