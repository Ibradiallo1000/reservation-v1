/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
  readonly VITE_RECAPTCHA_V3_KEY: string;
  readonly VITE_APPCHECK_DEBUG: string;
  readonly VITE_FIRESTORE_FORCE_LONG_POLLING: string;
  readonly VITE_USE_EMULATORS: string;
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

