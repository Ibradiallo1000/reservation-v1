// src/types/reservation.ts
// Source de vérité unique pour les statuts de réservation

/** Statuts officiels (canonique). Préférer : en_attente_paiement, preuve_recue, confirme, paye, annule, refuse. */
export type ReservationStatus =
  | "en_attente_paiement"
  | "preuve_recue"
  | "confirme"
  | "paye"
  | "annule"
  | "refuse"
  | "en_attente"
  | "paiement_en_cours"
  | "verification"
  | "embarque"
  | "embarqué"
  | "payé"
  | "refusé"
  | "annulé";

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
  /** Référence paiement (une seule preuve) */
  paymentReference?: string;
  companySlug?: string;
  paymentMethodLabel?: string;
  guichetierId?: string;
  shiftId?: string;
  reason?: string;
  /** Motif de refus (validation/refusal flow) */
  refusalReason?: string;
  validatedAt?: any;
  refusedAt?: any;
  createdAt?: any;
  /** Optional reference to daily trip instance (companies/{companyId}/tripInstances/{id}). When set, reservedSeats is updated on instance. */
  tripInstanceId?: string | null;
  /** Order of the origin stop on the route (for segment-based occupancy). */
  originStopOrder?: number | null;
  /** Order of the destination stop on the route (for segment-based occupancy). */
  destinationStopOrder?: number | null;
  /** Statut d'embarquement : pending (défaut), boarded, no_show. */
  boardingStatus?: "pending" | "boarded" | "no_show";
  /** Statut de descente : pending (défaut), dropped. */
  dropoffStatus?: "pending" | "dropped";
  /** Statut dans le voyage : booked | boarded | in_transit | dropped. */
  journeyStatus?: "booked" | "boarded" | "in_transit" | "dropped";
  /** Set when this reservation's montant has been added to dailyStats.ticketRevenue (prevents duplicate increments). */
  ticketRevenueCountedInDailyStats?: boolean;
  /** Correspondance multi-bus : même id sur toutes les réservations des segments. */
  connectionId?: string | null;
}
