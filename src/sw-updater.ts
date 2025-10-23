// src/sw-updater.ts
/**
 * Helpers pour détecter / appliquer une mise à jour de Service Worker
 *
 * - dispatch events:
 *   - "sw:updated-available" { detail: { registration, version } }
 *   - "sw:waiting" { detail: { registration, version } }
 *
 * - applyServiceWorkerUpdate(registration) -> Promise<void>
 */

type SWRegistrationWithWaiting = ServiceWorkerRegistration & { waiting?: ServiceWorker | null };

function extractVersionFromScriptURL(scriptURL?: string | null) {
  if (!scriptURL) return null;
  try {
    const u = new URL(scriptURL, location.href);
    // si on a un param v=... on le prend
    const v = u.searchParams.get("v") || u.searchParams.get("version") || null;
    return v || scriptURL;
  } catch {
    return scriptURL;
  }
}

export async function setupSwAutoUpdate(swPath = "/sw.js") {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  // si déjà waiting lors du (re)chargement, notifie tout de suite
  const currentRegistration = await navigator.serviceWorker.getRegistration();
  if (currentRegistration && (currentRegistration as SWRegistrationWithWaiting).waiting) {
    const version = extractVersionFromScriptURL((currentRegistration as SWRegistrationWithWaiting).waiting?.scriptURL ?? null);
    window.dispatchEvent(new CustomEvent("sw:waiting", { detail: { registration: currentRegistration, version } }));
    window.dispatchEvent(new CustomEvent("sw:updated-available", { detail: { registration: currentRegistration, version } }));
  }

  // on écoute les nouveaux enregistrements (updatefound)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // controller change fired when a new SW takes control (after skipWaiting)
    // l'app va normalement reload, mais on peut notifier si besoin.
  });

  // Récupère les registrations et observe 'updatefound' / waiting state
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => observeRegistration(reg));
  });

  // observe new registrations (e.g. registration done after page load)
  // note: on ne "registre" pas ici, on se contente d'observer
  (navigator.serviceWorker as any).addEventListener?.("controllerchange", () => {});

  function observeRegistration(reg: ServiceWorkerRegistration) {
    const r = reg as SWRegistrationWithWaiting;

    // si déjà waiting
    if (r.waiting) {
      const version = extractVersionFromScriptURL(r.waiting.scriptURL);
      window.dispatchEvent(new CustomEvent("sw:waiting", { detail: { registration: r, version } }));
      window.dispatchEvent(new CustomEvent("sw:updated-available", { detail: { registration: r, version } }));
    }

    reg.addEventListener?.("updatefound", () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener("statechange", () => {
        if (newWorker.state === "installed") {
          // si there's a waiting, notify
          if (reg.waiting) {
            const version = extractVersionFromScriptURL(reg.waiting.scriptURL);
            window.dispatchEvent(new CustomEvent("sw:waiting", { detail: { registration: reg, version } }));
            window.dispatchEvent(new CustomEvent("sw:updated-available", { detail: { registration: reg, version } }));
          }
        }
      });
    });
  }
}

/**
 * Applique la mise à jour : poste SKIP_WAITING et attend controllerchange.
 * Résout quand le nouveau SW controle la page (prêt à reload).
 */
export function applyServiceWorkerUpdate(registration: ServiceWorkerRegistration) {
  return new Promise<void>((resolve, reject) => {
    try {
      const r = registration as SWRegistrationWithWaiting;
      if (!r.waiting) {
        resolve();
        return;
      }

      let resolved = false;
      const onControllerChange = () => {
        if (resolved) return;
        resolved = true;
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        resolve();
      };

      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

      // demande au SW d'activer tout de suite (le SW doit écouter SKIP_WAITING)
      try {
        r.waiting!.postMessage({ type: "SKIP_WAITING" });
      } catch (err) {
        // fallback : on tente skipWaiting via registration.waiting?.skipWaiting si dispo
        try {
          (r.waiting as any).skipWaiting?.();
        } catch {}
      }

      // Timeout au cas où (10s) -> reject
      setTimeout(() => {
        if (!resolved) {
          navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
          reject(new Error("timeout waiting for controllerchange"));
        }
      }, 10000);
    } catch (err) {
      reject(err);
    }
  });
}
