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

// Firebase modules
declare module 'firebase/app' {
  export * from 'firebase/app';
}

declare module 'firebase/auth' {
  export * from 'firebase/auth';
}

declare module 'firebase/firestore' {
  export * from 'firebase/firestore';
}

declare module 'firebase/storage' {
  export * from 'firebase/storage';
}

declare module 'firebase/functions' {
  export * from 'firebase/functions';
}

declare module 'firebase/app-check' {
  export * from 'firebase/app-check';
}
