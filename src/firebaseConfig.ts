// src/firebaseConfig.ts
import { initializeApp, getApps, getApp, deleteApp, FirebaseOptions } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig: FirebaseOptions = {
  apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
  authDomain: "monbillet-95b77.firebaseapp.com",
  projectId: "monbillet-95b77",
  storageBucket: "monbillet-95b77.appspot.com",
  messagingSenderId: "337289733382",
  appId: "1:337289733382:web:bb99ee8f48861b47226a87",
  measurementId: "G-G96GYRYS76",
};

// ⚠️ Anti-HMR : si une app existe mais avec un autre projectId, on la détruit et on réinitialise
async function ensureApp() {
  const apps = getApps();
  if (apps.length) {
    const current = getApp();
    // @ts-ignore - options non typées complètes
    const currentProject = current.options?.projectId;
    if (currentProject && currentProject !== firebaseConfig.projectId) {
      await deleteApp(current);
      return initializeApp(firebaseConfig, 'monbillet-client');
    }
    return current;
  }
  return initializeApp(firebaseConfig, 'monbillet-client');
}

const appPromise = ensureApp();

export const getFirebase = async () => {
  const app = await appPromise;

  // Log très utile pour vérifier le projet réellement utilisé côté navigateur
  // (tu verras ça dans la console du navigateur)
  // @ts-ignore
  console.info('[FIREBASE] projectId:', app.options?.projectId);

  const db = getFirestore(app);
  const auth = getAuth(app);
  const storage = getStorage(app);
  const functions = getFunctions(app);

  // Persistance (optionnel)
  try {
    await enableMultiTabIndexedDbPersistence(db);
  } catch {
    try { await enableIndexedDbPersistence(db); } catch {}
  }

  return { app, db, auth, storage, functions };
};

// Pour compatibilité avec ton code existant qui importait { db, auth, storage, functions }
export let db: ReturnType<typeof getFirestore>;
export let auth: ReturnType<typeof getAuth>;
export let storage: ReturnType<typeof getStorage>;
export let functions: ReturnType<typeof getFunctions>;

(async () => {
  const x = await getFirebase();
  db = x.db; auth = x.auth; storage = x.storage; functions = x.functions;
})();
