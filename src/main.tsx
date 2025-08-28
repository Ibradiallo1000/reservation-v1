import './firebaseConfig';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './i18n';

/* === Aide index Firestore : capter proprement l’erreur "create_index" === */
function openIndexHelp(err: any) {
  const txt = String(err?.message || err?.stack || '');
  const linkMatch = txt.match(/https?:\/\/[^\s"]*indexes[^\s"]*/i);
  const url = linkMatch ? linkMatch[0] : null;

  // Message simple pour tout le monde
  const base = 'Cette requête Firestore a besoin d’un index.';
  const detail = url
    ? `\n\n👉 Cliquez sur "Créer l’index", puis revenez sur l’app.\n\nLien : ${url}`
    : `\n\n👉 Allez dans la console Firebase > Firestore > Indexes > "Create index".`;

  alert(base + detail);
  if (url) { try { window.open(url, '_blank', 'noopener'); } catch {} }
  // Log propre en console pour le debug
  // eslint-disable-next-line no-console
  console.warn('[Firestore] Index requis →', url || '(aucun lien détecté)', err);
}

// 0) erreurs JS synchrones
window.addEventListener('error', (event: ErrorEvent) => {
  const e: any = event?.error;
  if (e?.code === 'failed-precondition' && String(e?.message||'').includes('create_index')) {
    openIndexHelp(e);
    event.preventDefault?.();
  }
});

// 1) promesses non catchées
window.addEventListener('unhandledrejection', (event) => {
  const e: any = event?.reason;
  if (e?.code === 'failed-precondition' && String(e?.message||'').includes('create_index')) {
    openIndexHelp(e);
    event.preventDefault?.();
  }
});

// 2) en DEV, on intercepte console.error pour remonter le lien propre
if (import.meta?.env?.MODE !== 'production') {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const e = args?.[0];
    if (e?.code === 'failed-precondition' && String(e?.message||'').includes('create_index')) {
      openIndexHelp(e);
    } else {
      originalConsoleError(...args);
    }
  };
}
/* ===================================================================== */

/* Nettoyage des Service Workers existants (on force une PWA "off") */
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
