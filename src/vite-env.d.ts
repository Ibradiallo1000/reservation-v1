/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  // tu peux ajouter d'autres variables ici si besoin
  // readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// 🔑 Déclarations pour le service worker
interface ServiceWorkerGlobalScope extends WorkerGlobalScope {
  skipWaiting: () => void;
  clients: Clients;
}

// Workbox injecte automatiquement cette constante
declare let self: ServiceWorkerGlobalScope;
declare const __WB_MANIFEST: Array<{}>;
