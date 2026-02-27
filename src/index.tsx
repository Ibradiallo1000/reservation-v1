// src/index.tsx
import { initFirebase } from "./firebaseConfig";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import "./index.css";
import i18n from "./i18n";
import { handleFirestoreError } from "./utils/firestoreErrorHandler";

/* ================== Interception globale des erreurs Firestore ================== */
/** On évite de patcher plusieurs fois pendant le HMR */
const w = window as any;
if (!w.__teliya_boot_patched) {
  w.__teliya_boot_patched = true;

  // 1) Promesses non catchées
  const onUnhandled = (event: PromiseRejectionEvent) => {
    const err: any = event?.reason;
    const msg = String(err?.message ?? "");
    if (err?.code === "failed-precondition" && msg.includes("create_index")) {
      handleFirestoreError(err);
      event.preventDefault?.();
    }
  };
  window.addEventListener("unhandledrejection", onUnhandled);

  // 2) Erreurs classiques
  const onError = (event: ErrorEvent) => {
    const err: any = event?.error;
    const msg = String(err?.message ?? "");
    if (err?.code === "failed-precondition" && msg.includes("create_index")) {
      handleFirestoreError(err);
    }
  };
  window.addEventListener("error", onError);

  // 3) Interception console.error
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const err = args?.[0];
    const msg = String(err?.message ?? "");
    if (err?.code === "failed-precondition" && msg.includes("create_index")) {
      handleFirestoreError(err);
    }
    originalConsoleError(...args);
  };
}
/* ============================================================================ */

/** Désactivation forcée des anciens Service Workers */
if ("serviceWorker" in navigator) {
  const FORCE_UNREGISTER_SW = true;
  if (FORCE_UNREGISTER_SW) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
}

/** Typage Router v7 */
type RouterFuture = Partial<{
  v7_startTransition: boolean;
  v7_relativeSplatPath: boolean;
}>;

const THEME_STORAGE_KEY = "public-theme-dark";

/** Apply saved theme before paint (no flash) */
function applySavedTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "true") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  } catch (_) {}
}

/* ===================== Boot app (attend initFirebase) ===================== */
(async () => {
  applySavedTheme();

  try {
    await initFirebase(); // connecte émulateurs si activés
  } catch (err) {
    console.warn("⚠️ initFirebase a échoué — on continue :", err);
  }

  const rootEl = document.getElementById("root");
  if (!rootEl) {
    console.error("❌ Impossible de trouver #root");
    return;
  }

  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter
        future={
          {
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          } as RouterFuture
        }
      >
        <I18nextProvider i18n={i18n}>
          <App />
        </I18nextProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
})();
