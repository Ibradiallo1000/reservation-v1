// src/firebaseConfig.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  connectFirestoreEmulator,
  setLogLevel,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// App Check
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

/* =====================================================================
   1) CONFIG FIREBASE
   Remplace par tes valeurs si besoin (actuellement inchangées).
   Pour auth/network-request-failed: vérifier Firebase Console >
   Authentication > Paramètres > Autoriser les domaines (inclure localhost).
   Les requêtes Auth passent par identitytoolkit.googleapis.com et
   securetoken.googleapis.com — ne pas bloquer (proxy/pare-feu).
===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
  authDomain: "monbillet-95b77.firebaseapp.com",
  projectId: "monbillet-95b77",
  storageBucket: "monbillet-95b77.appspot.com",
  messagingSenderId: "337289733382",
  appId: "1:337289733382:web:bb99ee8f48861b47226a87",
  measurementId: "G-G96GYRYS76",
};

/* =====================================================================
   2) INIT APP (idempotent)
===================================================================== */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* =====================================================================
   3) APP CHECK (optionnel)
===================================================================== */
const RECAPTCHA_SITE_KEY = import.meta?.env?.VITE_RECAPTCHA_V3_KEY;

if (typeof window !== "undefined") {
  const debug =
    import.meta?.env?.VITE_APPCHECK_DEBUG === "true" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

  if (debug) {
    // @ts-ignore
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    try {
      localStorage.setItem("FIREBASE_APPCHECK_DEBUG_TOKEN", "true");
    } catch {}
  }

  if (RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }
}

/* =====================================================================
   4) SERVICES FIRESTORE + AUTH + STORAGE + FUNCTIONS
===================================================================== */

const FORCE_LONG_POLLING =
  import.meta?.env?.VITE_FIRESTORE_FORCE_LONG_POLLING === "true";
const DISABLE_PERSISTENCE =
  import.meta?.env?.VITE_FIRESTORE_DISABLE_PERSISTENCE === "true";

const db = initializeFirestore(app, {
  localCache: DISABLE_PERSISTENCE
    ? memoryLocalCache()
    : persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: !FORCE_LONG_POLLING,
  experimentalForceLongPolling: FORCE_LONG_POLLING,
});

setLogLevel("error");

const auth = getAuth(app);
const storage = getStorage(app);
// getFunctions with region, but note: connectFunctionsEmulator will attach to this instance
const functions = getFunctions(app, "europe-west1");

/* =====================================================================
   5) ÉMULATEURS EN LOCAL (contrôlable via .env)
===================================================================== */

const wantEmulators = import.meta?.env?.VITE_USE_EMULATORS === "true";
const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const shouldUseEmulators = wantEmulators && isLocalhost;

/**
 * initFirebase()
 * Appelle une seule fois au démarrage (ex: index.tsx). Si shouldUseEmulators true,
 * connecte les services aux émulateurs locaux.
 */
export async function initFirebase() {
  try {
    if (shouldUseEmulators) {
      console.info("⚡ Connexion aux émulateurs Firebase…");

      // Firestore
      connectFirestoreEmulator(db, "127.0.0.1", 8080);

      // Auth
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });

      // Storage
      connectStorageEmulator(storage, "127.0.0.1", 9199);

      // Functions (attache à l'instance functions déclarée ci-dessus)
      connectFunctionsEmulator(functions, "127.0.0.1", 5001);

      console.info("🔥 Émulateurs connectés.");
    } else {
      console.info("ℹ️ Emulateurs désactivés (mode cloud).");
    }
  } catch (err) {
    console.warn("⚠️ initFirebase() erreur :", err);
  }
}

/**
 * dbReady : promesse résolue après initFirebase()
 * - utile pour du code qui faisait `await dbReady;` pour s'assurer que
 *   la connexion aux émulateurs / initialisation est faite.
 *
 * IMPORTANT: n'appelle pas initFirebase automatiquement ici — laisse le caller
 * (index.tsx / main.tsx) décider quand initialiser.
 */
export const dbReady: Promise<void> = (async () => {
  // Ne pas init automatiquement — on attend que l'appelant fasse initFirebase()
  // pour garder le contrôle (HMR / tests / SSR).
  return;
})();

/* =====================================================================
   AUTH NETWORK DIAGNOSTICS (auth/network-request-failed)
===================================================================== */
const FIREBASE_AUTH_ENDPOINTS = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
] as const;

/**
 * Log Firebase Auth config state (no secrets). Run in console to verify setup.
 */
export function logAuthConfigCheck(): void {
  if (typeof window === "undefined") return;
  const ok = Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId
  );
  console.info("[Firebase Auth] config check:", {
    hasApiKey: Boolean(firebaseConfig.apiKey),
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    configOk: ok,
  });
}

/**
 * Check connectivity to Firebase Auth endpoints. Resolves to true if at least one
 * endpoint is reachable (HEAD request). Use to confirm no proxy/firewall block.
 */
export async function checkFirebaseAuthConnectivity(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  for (const base of FIREBASE_AUTH_ENDPOINTS) {
    try {
      const r = await fetch(base, { method: "HEAD", mode: "no-cors" });
      console.info("[Firebase Auth] connectivity:", base, "ok");
      return true;
    } catch (e) {
      console.warn("[Firebase Auth] connectivity failed:", base, e);
    }
  }
  console.warn(
    "[Firebase Auth] All endpoints unreachable. Check proxy/firewall for:",
    FIREBASE_AUTH_ENDPOINTS
  );
  return false;
}

/* =====================================================================
   EXPORTS
===================================================================== */
export { app, db, auth, storage, functions, firebaseConfig };
