// src/registerServiceWorker.ts
export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  // On enregistre après le load pour éviter HMR problèmes en dev
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");

      // Si une nouvelle SW est trouvée pendant la session
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed") {
            // Si il existe déjà une SW active -> c'est une mise à jour (waiting)
            if (navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent("sw:updated", { detail: { registration } }));
            } else {
              // Première installation (offline ready)
              window.dispatchEvent(new CustomEvent("sw:installed", { detail: { registration } }));
            }
          }
        });
      });
    } catch (err) {
      // console.warn("SW registration failed:", err);
    }
  });
}
