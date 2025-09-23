export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        // Écoute si un nouveau SW est en attente
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          reg.waiting.addEventListener('statechange', (e: any) => {
            if (e.target.state === 'activated') {
              window.location.reload();
            }
          });
        }
      } catch (err) {
        console.warn('SW registration failed', err);
      }
    });
  }
}
