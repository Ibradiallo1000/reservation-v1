// src/firebaseConfig.ts
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
  authDomain: "monbillet-95b77.firebaseapp.com",
  projectId: "monbillet-95b77",
  storageBucket: "monbillet-95b77.appspot.com",
  messagingSenderId: "337289733382",
  appId: "1:337289733382:web:bb99ee8f48861b47226a87",
  measurementId: "G-G96GYRYS76"
};

// ✅ Initialisation avec sécurité
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApps()[0];

const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
