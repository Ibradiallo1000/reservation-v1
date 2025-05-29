// ✅ src/firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
const firebaseConfig = {
    apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
    authDomain: "monbillet-95b77.firebaseapp.com",
    projectId: "monbillet-95b77",
    storageBucket: "monbillet-95b77.appspot.com", // ✅ corrigé
    messagingSenderId: "337289733382",
    appId: "1:337289733382:web:bb99ee8f48861b47226a87",
    measurementId: "G-69G3YRS7S6"
};
// 🔥 Initialiser Firebase
const app = initializeApp(firebaseConfig);
// 📦 Exporter Firestore et Auth
export const db = getFirestore(app);
export const auth = getAuth(app);
