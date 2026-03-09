/**
 * Unified agency city fallback: city ?? villeNorm ?? ville.
 * Use when reading agency document to get the agency's city.
 */
export function getAgencyCityFromDoc(data: {
  city?: string;
  villeNorm?: string;
  ville?: string;
} | null | undefined): string {
  if (!data) return "";
  return (data.city ?? data.villeNorm ?? data.ville ?? "").trim();
}
