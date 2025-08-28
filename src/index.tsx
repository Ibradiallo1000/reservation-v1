import './firebaseConfig';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n';
import { handleFirestoreError } from './utils/firestoreErrorHandler';

/* ================== Interception globale des erreurs d’index ================== */
// 1) Promesses non catchées
window.addEventListener('unhandledrejection', (event) => {
  const err: any = event?.reason;
  const msg = String(err?.message ?? '');
  if (err?.code === 'failed-precondition' && msg.includes('create_index')) {
    handleFirestoreError(err);
    // Évite le popup rouge React dans certains cas
    event.preventDefault?.();
  }
});

// 2) console.error (optionnel mais pratique : remonte un lien propre)
const originalConsoleError = console.error.bind(console);
console.error = (...args: any[]) => {
  const err = args?.[0];
  const msg = String(err?.message ?? '');
  if (err?.code === 'failed-precondition' && msg.includes('create_index')) {
    handleFirestoreError(err);
  } else {
    originalConsoleError(...args);
  }
};
/* ============================================================================ */

// Nettoyage des Service Workers existants
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        // @ts-ignore
        v7_startTransition: true,
        // @ts-ignore
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
