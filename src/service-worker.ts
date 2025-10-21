// src/sw-updater.ts
export async function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration | null) {
  if (!registration) return;
  // registration peut être le registration global; assure-toi qu'il y a un waiting
  const waiting = registration.waiting;
  if (!waiting) return;

  // demander au SW d'activer tout de suite
  waiting.postMessage({ type: "SKIP_WAITING" });

  // attendre que le SW devienne 'activated'
  await new Promise<void>((resolve) => {
    waiting.addEventListener("statechange", function listener(e: any) {
      if (e.target.state === "activated") {
        waiting.removeEventListener("statechange", listener);
        resolve();
      }
    });
    // fallback: si rien ne vient au bout de 5s, on résoud pour éviter blocage
    setTimeout(() => resolve(), 5000);
  });

  // enfin, reload de la page (optionnel — fait seulement après activation)
  window.location.reload();
}
