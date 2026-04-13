/**
 * Entite Payment - unification des flux guichet + online.
 * Collection: companies/{companyId}/payments/{paymentId}
 */

export type PaymentChannel = "guichet" | "online" | "courrier";
export type PaymentProvider = "wave" | "orange" | "moov" | "cash";
/** Apres validation operateur / guichet : statut "validated". */
export type PaymentStatus = "pending" | "validated" | "rejected" | "refunded";
/** Statut de synchronisation payment -> ledger. */
export type PaymentLedgerStatus = "pending" | "posted" | "failed";

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
  /** Source de verite finance: posted uniquement quand l'ecriture ledger est enregistree. */
  ledgerStatus: PaymentLedgerStatus;
  ledgerPostedAt?: unknown;
  ledgerLastAttemptAt?: unknown;
  ledgerError?: string | null;
  ledgerRetryCount?: number;
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
   * Si defini : `setDoc` avec cet ID (ex. reservation en ligne = meme id que `reservationId`)
   * pour permettre getDoc public + regles Firestore sans requete list.
   */
  paymentDocumentId?: string;
}
