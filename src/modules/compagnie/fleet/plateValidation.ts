// Phase 1H — Validation plaques par pays. Mali : format nouveau + ancien.

export const PLATE_COUNTRIES = [
  { code: "ML", label: "Mali (ML)" },
  // Extensible : autres pays à ajouter ici
] as const;

export type PlateCountryCode = (typeof PLATE_COUNTRIES)[number]["code"];

/** Formats acceptés par pays. Mali : nouveau (AA100AF) et ancien (AB1234MD). */
export const plateFormats: Record<
  string,
  { patterns: RegExp[] }
> = {
  ML: {
    patterns: [
      /^[A-Z]{2}[0-9]{3}[A-Z]{2}$/,   // Nouveau : AA100AF
      /^[A-Z]{2}[0-9]{4}MD$/,          // Ancien : AB1234MD
    ],
  },
};

/** Normalise la plaque : majuscules, sans espaces ni tirets. */
export function normalizePlate(raw: string): string {
  return String(raw ?? "")
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .toUpperCase();
}

/**
 * Valide une plaque pour un pays donné.
 * Accepte la valeur avec ou sans espaces (normalisation interne).
 */
export function validatePlate(country: string, plateNumber: string): boolean {
  const normalized = normalizePlate(plateNumber);
  if (!normalized) return false;
  const config = plateFormats[country];
  if (!config?.patterns?.length) return true; // Pas de règle = accepté
  return config.patterns.some((re) => re.test(normalized));
}

/** Format final stocké : "AA 100 AF" (avec espaces). part1/part3 = 2 lettres, part2 = 3 ou 4 chiffres. */
export function formatPlateFromParts(part1: string, part2: string, part3: string): string {
  const p1 = String(part1 ?? "").toUpperCase().replace(/\s/g, "").slice(0, 2);
  const p2 = String(part2 ?? "").replace(/\D/g, "").slice(0, 4);
  const p3 = String(part3 ?? "").toUpperCase().replace(/\s/g, "").slice(0, 2);
  if (!p1 || !p2 || !p3) return "";
  return `${p1} ${p2} ${p3}`.trim();
}

/** Décompose une plaque stockée "AA 100 AF" en 3 parties pour préremplissage. */
export function parsePlateToParts(plateNumber: string): { part1: string; part2: string; part3: string } {
  const n = normalizePlate(plateNumber);
  if (!n) return { part1: "", part2: "", part3: "" };
  const letters = n.replace(/\d/g, "");
  const digits = n.replace(/\D/g, "");
  const part1 = letters.slice(0, 2);
  const part3 = letters.slice(2, 4);
  const part2 = digits;
  return { part1, part2, part3 };
}
