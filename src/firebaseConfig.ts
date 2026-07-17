// src/firebaseConfig.ts
import { initializeApp, getApps, getApp, FirebaseOptions } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  connectFirestoreEmulator,
  setLogLevel,
} from "firebase/firestore";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

// App Check
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { assertSafeFirebaseEnvironment } from "@/config/environmentSafety";

/* =====================================================================
   1) CONFIG FIREBASE
   Pour auth/network-request-failed: vérifier Firebase Console >
   Authentication > Paramètres > Autoriser les domaines (inclure localhost).
   Les requêtes Auth passent par identitytoolkit.googleapis.com et
   securetoken.googleapis.com — ne pas bloquer (proxy/pare-feu).
===================================================================== */
const requiredEnv = {
  VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingRequiredEnv = Object.entries(requiredEnv)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingRequiredEnv.length > 0) {
  throw new Error(
    `[Firebase Config] Variables manquantes : ${missingRequiredEnv.join(", ")}`
  );
}

const firebaseConfig: FirebaseOptions = {
  apiKey: requiredEnv.VITE_FIREBASE_API_KEY,
  authDomain: requiredEnv.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: requiredEnv.VITE_FIREBASE_PROJECT_ID,
  storageBucket: requiredEnv.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: requiredEnv.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: requiredEnv.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export const environmentInfo = assertSafeFirebaseEnvironment({
  hostname: typeof window !== "undefined" ? window.location.hostname : "",
  mode: import.meta.env.MODE,
  projectId: firebaseConfig.projectId,
  useEmulators: import.meta.env.VITE_USE_EMULATORS === "true",
  allowProductionFromLocal:
    import.meta.env.VITE_ALLOW_PRODUCTION_FROM_LOCAL === "true",
});

export const APP_VERSION = import.meta.env.VITE_APP_VERSION || "dev";

/* =====================================================================
   2) INIT APP (idempotent)
===================================================================== */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* =====================================================================
   3) APP CHECK (optionnel)
===================================================================== */
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_V3_KEY;

if (typeof window !== "undefined") {
  const debug =
    import.meta.env.VITE_APPCHECK_DEBUG === "true" &&
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
  import.meta.env.VITE_FIRESTORE_FORCE_LONG_POLLING === "true";

// IndexedDB persistence disabled to avoid production crash (AS before initialization / heartbeat in separate chunk).
// Firestore works normally with in-memory cache only.
const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
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

const wantEmulators = environmentInfo.transport === "emulators";
const isLocalhost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const shouldUseEmulators = wantEmulators && isLocalhost;
// `assertSafeFirebaseEnvironment` bloque avant `initializeApp` toute combinaison
// locale/production ou émulateur/projet cloud non explicitement autorisée.

declare global {
  interface Window {
    __TELIYA_FIREBASE_EMULATORS_CONNECTED__?: boolean;
  }
}

/**
 * initFirebase()
 * Appelle une seule fois au démarrage (ex: index.tsx). Si shouldUseEmulators true,
 * connecte les services aux émulateurs locaux.
 */
export async function initFirebase() {
  try {
    if (shouldUseEmulators) {
      if (window.__TELIYA_FIREBASE_EMULATORS_CONNECTED__) {
        return;
      }

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

      window.__TELIYA_FIREBASE_EMULATORS_CONNECTED__ = true;
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
