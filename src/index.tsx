// src/index.tsx
import { initFirebase } from "./firebaseConfig";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nextProvider } from "react-i18next";
import App from "./App";
import "./index.css";
import i18n from "./i18n";
import { handleFirestoreError } from "./utils/firestoreErrorHandler";
import ErrorBoundary from "@/shared/core/ErrorBoundary";

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
  const FORCE_UNREGISTER_SW = import.meta?.env?.VITE_FORCE_UNREGISTER_SW === "true";
  if (FORCE_UNREGISTER_SW) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }

  navigator.serviceWorker.addEventListener("message", (event) => {
    const data = (event as MessageEvent)?.data as { type?: string; link?: string } | undefined;
    if (!data || data.type !== "PUSH_NAVIGATE" || !data.link) return;
    if (window.location.pathname !== data.link) {
      window.location.href = data.link;
    }
  });
}

/** Typage Router v7 */
type RouterFuture = Partial<{
  v7_startTransition: boolean;
  v7_relativeSplatPath: boolean;
}>;

const THEME_STORAGE_KEY = "teliya:theme";

/** Apply saved theme before paint (no flash). Uses same key as Header/InternalLayout. */
function applySavedTheme() {
  try {
    let isDark = false;
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark") isDark = true;
    else if (saved === "light") isDark = false;
    else if (saved === "system" || !saved) {
      const legacy = localStorage.getItem("public-theme-dark");
      if (legacy === "true") isDark = true;
      else if (legacy === "false") isDark = false;
      else isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    }
    document.documentElement.classList.toggle("dark", isDark);
  } catch (_) {}
}

/* ===================== Boot app ===================== */
const rootEl = document.getElementById("root");
if (!rootEl) {
  console.error("❌ Impossible de trouver #root");
} else {
  applySavedTheme();

  const FullApp = () => (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );

  const BootWrapper: React.FC = () => {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      initFirebase()
        .catch((err) => console.warn("⚠️ initFirebase a échoué — on continue :", err))
        .finally(() => setReady(true));
    }, []);
    // Un seul splash (natif, fond orange dans index.html/index.css). Pas de loader React intermédiaire.
    return ready ? <FullApp /> : null;
  };

  ReactDOM.createRoot(rootEl).render(<BootWrapper />);
}
