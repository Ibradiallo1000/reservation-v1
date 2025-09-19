// src/firebaseConfig.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  setLogLevel, // ⬅️ pour calmer la verbosité
} from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

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

/* ===================== SERVICES ===================== */
/** ✅ Nouvelle API : cache persistant multi-onglets + tolérance réseau */
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
  ignoreUndefinedProperties: true,
  // rend les connexions plus fiables quand WebChannel est bloqué par le réseau/DNS
  experimentalAutoDetectLongPolling: true,
  // experimentalForceLongPolling: true, // <-- décommente si réseau vraiment récalcitrant
});
setLogLevel('error'); // coupe les logs verbeux Firestore en console

const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

/* ===================== EMULATEURS (optionnel) ===================== */
const useEmulators = import.meta?.env?.VITE_USE_EMULATORS === 'true';

export const dbReady = (async () => {
  try {
    if (useEmulators) {
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      console.info('✅ Emulateurs Firebase connectés (Firestore/Auth/Storage/Functions).');
    }
  } catch (e) {
    console.warn('⚠️ Initialisation Firestore partielle (continuer en mode dégradé).', e);
  }
})();

export { app, db, auth, storage, functions };
