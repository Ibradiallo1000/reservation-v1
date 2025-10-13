// src/sw-updater.ts
// Détecte une nouvelle version, force skipWaiting et recharge l'app.

export function setupSwAutoUpdate() {
  if (!('serviceWorker' in navigator)) return;

  // Enregistre le SW (fichier placé dans /public/service-worker.js)
  navigator.serviceWorker.register('/service-worker.js').then((reg) => {
    // Vérifie immédiatement s'il existe une mise à jour
    reg.update();

    // Quand une nouvelle version est trouvée
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // "installed" + il y a déjà un controller => on remplace l’ancienne version
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  });

  // Quand le nouveau SW prend le contrôle, on recharge la page
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // évite les rechargements multiples
    if ((window as any).__reloadedBySw) return;
    (window as any).__reloadedBySw = true;
    window.location.reload();
  });

  // Re-vérifier à chaque retour au premier plan
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then((r) => r?.update());
    }
  });
}
