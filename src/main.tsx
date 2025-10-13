import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";
import { setupSwAutoUpdate } from "./sw-updater";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ✅ Enregistre le Service Worker + auto-update (skipWaiting + reload)
setupSwAutoUpdate();

(async () => {
  const rootEl = document.getElementById("root") as HTMLElement | null;
  const splash = document.getElementById("splash");

  if (!rootEl) {
    console.error("❌ Impossible de trouver #root");
    return;
  }

  // 1) Monte l'app immédiatement
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );

  // 2) Promesse "premier paint stable"
  const firstPaint = new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });

  // 3) Paramètres de timing
  const MIN = 1000;  // ms d'expo minimale du splash
  const MAX = 3000;  // ms plafond absolu

  const start = performance.now();

  // 3a) Attendre paint OU MAX
  await Promise.race([firstPaint, sleep(MAX)]);

  // 3b) Respecter MIN
  const elapsed = performance.now() - start;
  if (elapsed < MIN) {
    await sleep(MIN - elapsed);
  }

  // 4) Signaler au HTML que l'app est prête
  window.dispatchEvent(new Event("teliya:app-ready"));

  // 5) Transition + sortie du splash
  if (splash) {
    try {
      splash.classList.add("leaving");
      await sleep(430); // durée anim CSS
      splash.remove();
    } catch (err) {
      console.warn("⚠️ Erreur lors de la suppression du splash:", err);
    }
  }

  // 6) Révéler l'app
  rootEl.classList.add("ready");
})();
