/**
 * Champs ville / libellé agence — aligné guichet, compta, courrier.
 */
export function cityLabelFromAgencyDoc(data: Record<string, unknown> | undefined | null): string {
  if (!data) return "";
  return String(data.ville ?? data.city ?? data.nomVille ?? data.villeDepart ?? "").trim();
}

export function agencyNomFromDoc(data: Record<string, unknown> | undefined | null): string {
  if (!data) return "";
  return String(data.nomAgence ?? data.nom ?? "").trim();
}
