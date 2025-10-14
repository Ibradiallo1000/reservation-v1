// src/firebaseConfig.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  setLogLevel,
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

// ✅ App Check (protège Firestore/Storage/Functions)
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

/* ===================== CONFIG FIREBASE ===================== */
const firebaseConfig = {
  apiKey: 'AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM',
  authDomain: 'monbillet-95b77.firebaseapp.com',
  projectId: 'monbillet-95b77',
  storageBucket: 'monbillet-95b77.appspot.com',
  messagingSenderId: '337289733382',
  appId: '1:337289733382:web:bb99ee8f48861b47226a87',
  measurementId: 'G-G96GYRYS76',
};

/* ===================== INIT APP (idempotent) ===================== */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* ===================== App Check ===================== */
/**
 * Prod : reCAPTCHA v3 avec clé site dans VITE_RECAPTCHA_V3_KEY
 * Dev  : possibilité d'activer un token debug (voir console note ci-dessous)
 */
const RECAPTCHA_SITE_KEY = import.meta?.env?.VITE_RECAPTCHA_V3_KEY;

if (typeof window !== 'undefined') {
  // Optionnel : activer un token debug en local (à n'utiliser qu'en dev)
  // - Soit tu mets VITE_APPCHECK_DEBUG=true dans .env.local
  // - Soit tu tapes dans la console : localStorage.setItem('FIREBASE_APPCHECK_DEBUG_TOKEN', 'true');
  const wantDebug =
    import.meta?.env?.VITE_APPCHECK_DEBUG === 'true' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname);

  if (wantDebug) {
    // @ts-ignore: variable debug reconnue par SDK
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    try {
      localStorage.setItem('FIREBASE_APPCHECK_DEBUG_TOKEN', 'true');
    } catch {}
  }

  if (RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

/* ===================== SERVICES ===================== */
const FORCE_LONG_POLLING =
  import.meta?.env?.VITE_FIRESTORE_FORCE_LONG_POLLING === 'true';
const DISABLE_PERSISTENCE =
  import.meta?.env?.VITE_FIRESTORE_DISABLE_PERSISTENCE === 'true';

const db = initializeFirestore(app, {
  localCache: DISABLE_PERSISTENCE
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: !FORCE_LONG_POLLING,
  experimentalForceLongPolling: FORCE_LONG_POLLING,
});

// Réduit le bruit en prod tout en gardant les erreurs visibles
setLogLevel('error');

const auth = getAuth(app);
const storage = getStorage(app);

/** Région alignée sur les Functions déployées */
const functions = getFunctions(app, 'europe-west1');

/* ===================== EMULATEURS : uniquement en local ===================== */
// On n’active JAMAIS les émulateurs en prod Netlify, même si la variable est mal réglée.
const wantEmulators = import.meta?.env?.VITE_USE_EMULATORS === 'true';
const isLocalhost =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

// Active seulement si on est en local ET si la variable le demande.
const shouldUseEmulators = isLocalhost && wantEmulators;

export const dbReady = (async () => {
  try {
    if (shouldUseEmulators) {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      console.info('✅ Emulateurs Firebase connectés (local).');
    } else if (wantEmulators && !isLocalhost) {
      // Cas piège : variable mal réglée en prod
      console.warn('⚠️ VITE_USE_EMULATORS=true ignoré en prod (sécurité).');
    }
  } catch (e) {
    console.warn('⚠️ Initialisation partielle (mode dégradé).', e);
  }
})();

export { app, db, auth, storage, functions, firebaseConfig };
