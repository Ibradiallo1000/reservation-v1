import "./firebaseConfig";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";
import { handleFirestoreError } from "./utils/firestoreErrorHandler";

/* ================== Interception globale des erreurs d’index ================== */
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

  // 2) Erreurs "classiques" (ex. throw new Error(...))
  const onError = (event: ErrorEvent) => {
    const err: any = event?.error;
    const msg = String(err?.message ?? "");
    if (err?.code === "failed-precondition" && msg.includes("create_index")) {
      handleFirestoreError(err);
      // on laisse quand même la stack aller en console
    }
  };
  window.addEventListener("error", onError);

  // 3) console.error -> remonte un lien propre quand c'est un failed-precondition
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

/** Nettoyage des Service Workers existants (on garde le guard pour ne pas surprendre plus tard) */
if ("serviceWorker" in navigator) {
  // Mets à false si tu réactives un SW ensuite.
  const FORCE_UNREGISTER_SW = true;
  if (FORCE_UNREGISTER_SW) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });
  }
}

/** Typage propre de l’option future (évite @ts-ignore) */
type RouterFuture = Partial<{
  v7_startTransition: boolean;
  v7_relativeSplatPath: boolean;
}>;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={
        {
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        } as RouterFuture
      }
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
