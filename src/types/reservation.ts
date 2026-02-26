// src/types/reservation.ts
// Source de vérité unique pour les statuts de réservation

export type ReservationStatus =
  | "en_attente"
  | "paiement_en_cours"
  | "preuve_recue"
  | "verification"
  | "confirme"
  | "payé"
  | "embarqué"
  | "refusé"
  | "refuse"
  | "annulé"
  | "annule";

/** Interface canonique de réservation (source de vérité) */
export interface Reservation {
  id?: string;
  referenceCode?: string;
  companyId: string;
  agencyId: string;
  clientNom?: string;
  telephone?: string;
  email?: string;
  depart?: string;
  arrivee?: string;
  departure?: string;
  arrival?: string;
  date?: string;
  heure?: string;
  seatsGo?: number;
  seatsReturn?: number;
  montant?: number;
  canal?: string;
  statut: ReservationStatus;
  preuveUrl?: string;
  /** Alias courants pour l’URL de preuve de paiement */
  paymentProofUrl?: string;
  paiementPreuveUrl?: string;
  proofUrl?: string;
  receiptUrl?: string;
  preuveMessage?: string;
  companySlug?: string;
  paymentMethodLabel?: string;
  guichetierId?: string;
  shiftId?: string;
  reason?: string;
  validatedAt?: any;
  refusedAt?: any;
  createdAt?: any;
}
