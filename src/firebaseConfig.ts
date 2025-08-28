// src/firebaseConfig.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  enableIndexedDbPersistence,
  enableMultiTabIndexedDbPersistence,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import {
  getAuth,
  // initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  connectAuthEmulator,
} from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

/* ===================== CONFIG FIREBASE ===================== */
const firebaseConfig = {
  apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
  authDomain: "monbillet-95b77.firebaseapp.com",
  projectId: "monbillet-95b77",
  storageBucket: "monbillet-95b77.appspot.com",
  messagingSenderId: "337289733382",
  appId: "1:337289733382:web:bb99ee8f48861b47226a87",
  measurementId: "G-G96GYRYS76",
};

/* ===================== INIT APP (idempotent) ===================== */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* ===================== SERVICES ===================== */
const db = getFirestore(app);
const auth = getAuth(app);
// const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
const storage = getStorage(app);
// const functions = getFunctions(app, 'europe-west1');
const functions = getFunctions(app);

/* ===================== EMULATEURS (optionnel) ===================== */
const useEmulators = import.meta?.env?.VITE_USE_EMULATORS === 'true';

/**
 * dbReady : promesse qui s’assure que
 * - les émulateurs (si activés) sont connectés
 * - la persistance IndexedDB est bien initialisée
 * avant que le reste de l’app n’utilise Firestore.
 */
export const dbReady = (async () => {
  try {
    if (useEmulators) {
      // connecteurs AVANT toute opération réseau
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      console.info('✅ Emulateurs Firebase connectés (Firestore/Auth/Storage/Functions).');
    }

    // Persistance offline optimisée : multi-onglets → fallback single-onglet
    try {
      await enableMultiTabIndexedDbPersistence(db);
    } catch (err: any) {
      if (err?.code === 'failed-precondition') {
        try {
          await enableIndexedDbPersistence(db);
        } catch (err2) {
          console.warn('⚠️ Persistance Firestore désactivée (single-tab impossible).', err2);
        }
      } else if (err?.code === 'unimplemented') {
        console.warn('⚠️ Le navigateur ne supporte pas IndexedDB. Pas de persistance Firestore.');
      } else {
        console.warn('⚠️ Erreur inattendue lors de l’activation de la persistance Firestore.', err);
      }
    }
  } catch (e) {
    console.warn('⚠️ Initialisation Firestore partielle (continuer en mode dégradé).', e);
  }
})();

export { app, db, auth, storage, functions };
