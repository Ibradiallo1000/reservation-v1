// src/utils/codes.ts
/**
 * Retourne un acronyme en majuscules à partir d'un nom, ex: "Mali Trans Express" => "MTE".
 * Si rien n'est trouvé, retourne `fallback`.
 */
export function acronym(name?: string, fallback = "X"): string {
  if (!name) return fallback;
  const cleaned = String(name).trim();
  if (!cleaned) return fallback;
  // Première lettre de chaque mot alphanumérique
  const parts = cleaned.replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  let acc = parts.map(p => p[0]).join("").toUpperCase();
  // Si un seul mot, on prend 2 premières lettres si possible
  if (parts.length === 1 && parts[0].length >= 2) acc = parts[0].slice(0, 2).toUpperCase();
  return acc || fallback;
}