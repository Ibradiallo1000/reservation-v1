// src/utils/firestoreErrorHandler.ts
let lastShown = 0;

function parseIndexUrlFromError(err: any): string | null {
  // Firestore renvoie souvent un lien "https://console.firebase.google.com/.../indexes?create_composite=..."
  const text = String(err?.message || err?.stack || '');
  const match = text.match(/https?:\/\/[^\s"]*indexes[^\s"]*/i);
  return match ? match[0] : null;
}

export function handleFirestoreError(err: any) {
  // Anti-spam (évite 10 popups si plusieurs composants déclenchent l’erreur)
  const now = Date.now();
  if (now - lastShown < 2000) return;
  lastShown = now;

  const url = parseIndexUrlFromError(err);

  // Message simple et utile pour tout le monde
  const baseMsg = 'Cette requête Firestore a besoin d’un index (non créé).';
  const detail =
    url
      ? `\n\n👉 Cliquez sur "Créer l’index" puis revenez sur l’app.\n\nLien : ${url}`
      : '\n\n👉 Ouvrez la console Firebase > Firestore > Indexes > "Create index" (copiez la requête si besoin).';

  // Alert basique (remplace facilement par un toast si tu as une lib)
  alert(`${baseMsg}${detail}`);
  
  // Optionnel : ouvrir automatiquement l’onglet de création d’index
  if (url) {
    try { window.open(url, '_blank', 'noopener'); } catch {}
  }

  // Log propre pour les devs
  // eslint-disable-next-line no-console
  console.warn('[Firestore] Index requis →', url || '(aucun lien détecté)', err);
}
