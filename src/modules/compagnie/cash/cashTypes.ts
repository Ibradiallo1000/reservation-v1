/**
 * Gestion de caisse TELIYA — types pour cashTransactions et cashClosures.
 * Suivi encaissements agences principales et escales.
 */

export const CASH_TRANSACTIONS_COLLECTION = "cashTransactions";
export const CASH_CLOSURES_COLLECTION = "cashClosures";
export const CASH_REFUNDS_COLLECTION = "cashRefunds";
export const CASH_TRANSFERS_COLLECTION = "cashTransfers";

/** Statut d'une transaction caisse : payée, remboursée, orpheline (réservation absente/annulée), ou annulée. */
export const CASH_TRANSACTION_STATUS = {
  PAID: "paid",
  REFUNDED: "refunded",
  ORPHAN: "orphan",
  CANCELLED: "cancelled",
} as const;
export type CashTransactionStatus = (typeof CASH_TRANSACTION_STATUS)[keyof typeof CASH_TRANSACTION_STATUS];

export const LOCATION_TYPE = {
  AGENCE: "agence",
  ESCALE: "escale",
} as const;
export type LocationType = (typeof LOCATION_TYPE)[keyof typeof LOCATION_TYPE];

export const CASH_PAYMENT_METHOD = {
  CASH: "cash",
  MOBILE_MONEY: "mobile_money",
  CARD: "card",
  TRANSFER: "transfer",
} as const;
export type CashPaymentMethod = (typeof CASH_PAYMENT_METHOD)[keyof typeof CASH_PAYMENT_METHOD];

export interface CashTransactionDoc {
  reservationId: string;
  tripInstanceId?: string | null;
  amount: number;
  currency: string;
  paymentMethod: CashPaymentMethod | string;
  /** agence | escale */
  locationType: LocationType | string;
  /** agencyId (point de vente) */
  locationId: string;
  routeId?: string | null;
  createdBy: string;
  /** @deprecated Utiliser paidAt. Date du jour (YYYY-MM-DD) — conservé pour rétrocompat. */
  date: string;
  /** Date réelle d'encaissement (YYYY-MM-DD). Source de vérité pour les encaissements par période. */
  paidAt?: string;
  /** paid | refunded | orphan | cancelled. Défaut paid. */
  status?: CashTransactionStatus | string;
  createdAt: unknown;
  /** Remboursement / annulation : date de mise à jour du statut (Timestamp). */
  refundedAt?: unknown;
}

export interface CashTransactionDocWithId extends CashTransactionDoc {
  id: string;
}

export interface CashClosureDoc {
  locationType: LocationType | string;
  locationId: string;
  /** Date clôturée (YYYY-MM-DD) */
  date: string;
  /** Somme des cashTransactions du jour */
  expectedAmount: number;
  /** Montant déclaré par l'agent */
  declaredAmount: number;
  /** declaredAmount - expectedAmount */
  difference: number;
  createdBy: string;
  createdAt: unknown;
}

export interface CashClosureDocWithId extends CashClosureDoc {
  id: string;
}

/** Remboursement : annulation avec remboursement. */
export interface CashRefundDoc {
  reservationId: string;
  amount: number;
  locationType: LocationType | string;
  locationId: string;
  createdBy: string;
  createdAt: unknown;
  reason?: string | null;
  /** Date du remboursement (YYYY-MM-DD) */
  date?: string;
}

export interface CashRefundDocWithId extends CashRefundDoc {
  id: string;
}

/** Méthode de transfert vers la compagnie. */
export const CASH_TRANSFER_METHOD = {
  MOBILE_MONEY: "mobile_money",
  BANK: "bank",
  CASH: "cash",
} as const;
export type CashTransferMethod = (typeof CASH_TRANSFER_METHOD)[keyof typeof CASH_TRANSFER_METHOD];

/** Transfert d'argent du point de vente vers la compagnie. */
export interface CashTransferDoc {
  locationType: LocationType | string;
  locationId: string;
  amount: number;
  transferMethod: CashTransferMethod | string;
  createdBy: string;
  createdAt: unknown;
  /** Date du transfert (YYYY-MM-DD) */
  date?: string;
}

export interface CashTransferDocWithId extends CashTransferDoc {
  id: string;
}
