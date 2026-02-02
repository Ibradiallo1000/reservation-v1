// src/lib/firebaseClient.ts
// Initialise et exporte l'instance Firebase App (modular SDK v9+).

import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "<FIREBASE_API_KEY>",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "<PROJECT>.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "<PROJECT_ID>",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "<PROJECT>.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "<SENDER_ID>",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "<APP_ID>"
};

let app: FirebaseApp;
if (!getApps() || getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

export { app, getAuth, getFunctions, getFirestore };
export default app;
