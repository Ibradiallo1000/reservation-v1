export function slugify(s: string) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim().replace(/\s+/g, '-').toUpperCase();
}

/** Code court et stable (2–6 car.) pour compagnie/agence */
export function makeShortCode(name?: string, preferred?: string, maxLen = 5) {
  const pref = (preferred || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (pref) return pref.slice(0, maxLen);

  const n = (name || '').trim();
  if (!n) return 'ORG';

  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.slice(0, 3).map(w => w[0] || '').join('');
    if (initials) return initials.toUpperCase().slice(0, maxLen); // ex: "MALI TRANS" → "MT"
  }
  return slugify(n).replace(/-/g, '').slice(0, Math.max(3, maxLen)); // fallback
}

/** Label abrégé pour l’affichage (protège la mise en page) */
export function shortLabel(label?: string, max = 16) {
  const s = (label || '').trim();
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}
