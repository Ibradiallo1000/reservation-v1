/**
 * Entité Payment — unification des flux guichet + online.
 * Collection: companies/{companyId}/payments/{paymentId}
 */

export type PaymentChannel = "guichet" | "online" | "courrier";
export type PaymentProvider = "wave" | "orange" | "moov" | "cash";
/** Après validation opérateur / guichet : statut "validated" (ledger + compta). */
export type PaymentStatus = "pending" | "validated" | "rejected" | "refunded";

export interface Payment {
  id: string;
  reservationId: string;
  companyId: string;
  agencyId: string;
  amount: number;
  currency: string;
  channel: PaymentChannel;
  provider: PaymentProvider;
  status: PaymentStatus;
  createdAt: unknown;
  validatedAt?: unknown;
  validatedBy?: string;
  /** Motif en cas de rejet */
  rejectionReason?: string | null;
}

export interface CreatePaymentData {
  reservationId: string;
  companyId: string;
  agencyId: string;
  amount: number;
  currency: string;
  channel: PaymentChannel;
  provider: PaymentProvider;
  status?: PaymentStatus;
  validatedBy?: string;
  /**
   * Si défini : `setDoc` avec cet ID (ex. réservation en ligne = même id que `reservationId`)
   * pour permettre getDoc public + règles Firestore sans requête list.
   */
  paymentDocumentId?: string;
}
