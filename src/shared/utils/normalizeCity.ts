/**
 * Normalisation globale des noms de ville pour stockage et comparaison.
 * — minuscules
 * — suppression de tous les espaces (y compris internes)
 */
export function normalizeCity(city: string | null | undefined): string {
  return String(city ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}
