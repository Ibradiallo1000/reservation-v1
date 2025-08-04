// src/firebaseConfig.ts

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage'; 

// ✅ Ton objet de configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
  authDomain: "monbillet-95b77.firebaseapp.com",
  projectId: "monbillet-95b77",
  storageBucket: "monbillet-95b77.appspot.com",
  messagingSenderId: "337289733382",
  appId: "1:337289733382:web:bb99ee8f48861b47226a87",
  measurementId: "G-G96GYRYS76"
};

// ✅ Initialisation sécurisée
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

// ✅ Firestore avec persistance offline
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('⚠️ La persistance offline ne fonctionne pas : plusieurs onglets ouverts.');
  } else if (err.code === 'unimplemented') {
    console.warn('⚠️ Le navigateur ne supporte pas IndexedDB pour Firestore.');
  } else {
    console.error('❌ Erreur persistance Firestore:', err);
  }
});

// ✅ Exports clairs
const auth = getAuth(app);
const storage = getStorage(app);

export { db, auth, storage };
