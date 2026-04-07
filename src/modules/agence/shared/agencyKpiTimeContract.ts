/**
 * Contrat de temps — libellés pour les KPI agence (UI uniquement).
 */
export const AGENCY_KPI_TIME = {
  /** Mouvements financiers rattachés au jour de l’agence (fuseau agence). */
  LEDGER_BAMAKO: "Jour de l’agence (mouvements enregistrés)",
  SESSION_POSTE: "Session poste",
  DATE_VOYAGE: "Date de voyage",
  /** Billets vendus (guichet + en ligne), montants — période dans le fuseau agence, hors ledger. */
  CREATION_RESERVATION_BAMAKO: "Ventes billets (période)",
  WORKFLOW_PAIEMENT: "Paiements courrier",
} as const;

export type AgencyKpiTimeLabel = (typeof AGENCY_KPI_TIME)[keyof typeof AGENCY_KPI_TIME];
