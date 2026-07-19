import { initializeApp } from "firebase/app";
import { getFirestore, doc, updateDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[setUserRoles] Variable d'environnement manquante: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: requiredEnv("VITE_FIREBASE_API_KEY"),
  authDomain: requiredEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: requiredEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: requiredEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requiredEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requiredEnv("VITE_FIREBASE_APP_ID"),
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID,
};

if (
  firebaseConfig.projectId === "monbillet-95b77" &&
  process.env.TELIYA_ALLOW_PRODUCTION_ROLE_TOOL !== "true"
) {
  throw new Error(
    "[setUserRoles] Refus: l'outil cible la production. Definir TELIYA_ALLOW_PRODUCTION_ROLE_TOOL=true uniquement dans une phase production validee."
  );
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const userEmail = requiredEnv("TELIYA_ROLE_TOOL_EMAIL");
const userPassword = requiredEnv("TELIYA_ROLE_TOOL_PASSWORD");
const nouveauRole = requiredEnv("TELIYA_ROLE_TOOL_ROLE");

async function updateUserRole() {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, userEmail, userPassword);
    const user = userCredential.user;
    const uid = user.uid;

    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { role: nouveauRole });

    console.log(`Role de ${userEmail} mis a jour en : ${nouveauRole}`);
  } catch (error) {
    console.error("Erreur lors de la mise a jour du role :", error);
  }
}

updateUserRole();
