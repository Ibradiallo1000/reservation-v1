import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";

const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));

(async () => {
  const rootEl = document.getElementById("root")!;
  const splash = document.getElementById("splash");

  // Monte l'app TOUT DE SUITE (pendant que le splash reste visible)
  const root = ReactDOM.createRoot(rootEl);
  root.render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );

  // Laisse le splash au moins 1.0s, max 2.0s le temps que les chunks paresseux arrivent
  const MIN = 1000, MAX = 2000;
  await sleep(MIN);

  // Transition de sortie du splash (zoom-out du logo)
  if (splash) {
    splash.classList.add("leaving");
    await sleep(430);
    splash.remove();
  }

  // Révèle l'app
  rootEl.classList.add("ready");
})();
