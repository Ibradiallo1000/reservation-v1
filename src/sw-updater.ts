// src/sw-updater.ts
/**
 * Helper pour déclencher activation de la SW waiting + reload.
 * Expose un export nommé applyServiceWorkerUpdate (et un export default pour compatibilité).
 */

export async function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration | null) {
  if (!registration) return;

  const waiting = registration.waiting;
  if (!waiting) return;

  try {
    // Demande à la SW d'activer immédiatement
    waiting.postMessage({ type: "SKIP_WAITING" });
  } catch {
    // silence
  }

  // Attendre activation (ou timeout 5s)
  await new Promise<void>((resolve) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    }, 5000);

    const onStateChange = (ev: Event) => {
      try {
        // @ts-ignore - certains navigateurs passent l'objet
        const target: any = ev?.target;
        if (target && target.state === "activated" && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          try { target.removeEventListener("statechange", onStateChange); } catch {}
          resolve();
        }
      } catch {
        // ignore
      }
    };

    try {
      waiting.addEventListener("statechange", onStateChange);
    } catch {
      // addEventListener peut échouer dans certaines implémentations -> on résout au timeout
    }
  });

  // Puis reload pour charger les nouveaux assets
  try {
    window.location.reload();
  } catch {}
}

export default applyServiceWorkerUpdate;
