/**
 * Utilitaires formulaire guichet : nom (majuscule) et téléphone Mali (8 chiffres, affichage par paires).
 */

/** Première lettre de chaque mot en majuscule (ex: "jean dupont" → "Jean Dupont"). */
export function capitalizeFullName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/** Longueur attendue pour un numéro Mali (sans indicatif). */
export const PHONE_MALI_LENGTH = 8;

/** Extrait les chiffres uniquement (max 8 pour Mali). */
export function rawPhoneMali(display: string): string {
  const digits = (display || "").replace(/\D/g, "").slice(0, PHONE_MALI_LENGTH);
  return digits;
}

/** Valide un numéro Mali : exactement 8 chiffres. */
export function validPhoneMali(display: string): boolean {
  return rawPhoneMali(display).length === PHONE_MALI_LENGTH;
}

/** Formate l’affichage en paires : "12345678" → "12 34 56 78". */
export function formatPhoneMaliDisplay(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "").slice(0, PHONE_MALI_LENGTH);
  const parts: string[] = [];
  for (let i = 0; i < digits.length; i += 2) {
    parts.push(digits.slice(i, i + 2));
  }
  return parts.join(" ");
}
