/**
 * Empreinte appareil simple pour verrouillage de session (Phase 1 — Device lock).
 * Sans Cloud Functions : stockage local + hash léger.
 */

const STORAGE_KEY = 'teliya_device_fp';

function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h = ((h << 5) - h) + c;
    h = h & h;
  }
  return Math.abs(h).toString(36);
}

function getStableId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = [
        typeof navigator !== 'undefined' ? navigator.userAgent : '',
        typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '',
        Date.now().toString(36),
        Math.random().toString(36).slice(2, 10),
      ].join('|');
      const hashed = simpleHash(id);
      localStorage.setItem(STORAGE_KEY, hashed);
      return hashed;
    }
    return id;
  } catch {
    return simpleHash('fallback_' + Date.now());
  }
}

/**
 * Retourne une empreinte stable pour cet appareil (même navigateur).
 * userAgent + timestamp au premier appel pour renforcer l’unicité.
 */
export function getDeviceFingerprint(): string {
  const stable = getStableId();
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return simpleHash(stable + '|' + ua);
}
