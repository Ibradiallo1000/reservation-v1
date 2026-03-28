/**
 * Agency cash control — cash sessions per agent (GUICHET / COURRIER).
 * Path: companies/{companyId}/agences/{agencyId}/cashSessions/{sessionId}
 */

import type { Timestamp } from "firebase/firestore";

export const CASH_SESSION_COLLECTION = "cashSessions";

export const CASH_SESSION_TYPE = {
  GUICHET: "GUICHET",
  COURRIER: "COURRIER",
} as const;
export type CashSessionType = (typeof CASH_SESSION_TYPE)[keyof typeof CASH_SESSION_TYPE];

export const CASH_SESSION_STATUS = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  SUSPENDED: "SUSPENDED",
  VALIDATED: "VALIDATED",
  REJECTED: "REJECTED",
} as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUS)[keyof typeof CASH_SESSION_STATUS];

/** Payment method for expected/counted balances. */
export const CASH_PAYMENT_METHOD = {
  CASH: "cash",
  MOBILE_MONEY: "mobile_money",
  BANK: "bank",
} as const;
export type CashPaymentMethod = (typeof CASH_PAYMENT_METHOD)[keyof typeof CASH_PAYMENT_METHOD];

export interface CashSessionDoc {
  agentId: string;
  type: CashSessionType;
  openedAt: Timestamp;
  closedAt?: Timestamp | null;
  openingBalance: number;
  /** Legacy: total expected. Backward compat: if absent, use expectedCash (mapped from expectedBalance). */
  expectedBalance?: number;
  /** Expected amounts by payment method. New sessions set these; legacy only have expectedBalance → treated as expectedCash. */
  expectedCash?: number;
  expectedMobileMoney?: number;
  expectedBank?: number;
  /** Legacy: total counted at close. Backward compat: if absent, use sum of counted* or this. */
  countedBalance?: number | null;
  countedCash?: number | null;
  countedMobileMoney?: number | null;
  countedBank?: number | null;
  discrepancy?: number | null;
  status: CashSessionStatus;
  createdAt: unknown;
  updatedAt: unknown;
  validatedAt?: Timestamp | null;
  validatedBy?: string | null;
  rejectionReason?: string | null;
  suspendedAt?: Timestamp | null;
  suspendedBy?: string | null;
  suspensionReason?: string | null;
}

export type CashSessionDocWithId = CashSessionDoc & { id: string };

/** Total expected (backward compat: use expectedBalance when new fields absent). */
export function getTotalExpected(d: CashSessionDoc | CashSessionDocWithId): number {
  if (d.expectedCash != null || d.expectedMobileMoney != null || d.expectedBank != null) {
    return (Number(d.expectedCash) || 0) + (Number(d.expectedMobileMoney) || 0) + (Number(d.expectedBank) || 0);
  }
  return Number(d.expectedBalance ?? 0);
}

/** Total counted (backward compat: countedBalance when counted* absent). */
export function getTotalCounted(d: CashSessionDoc | CashSessionDocWithId): number {
  if (d.countedCash != null || d.countedMobileMoney != null || d.countedBank != null) {
    return (Number(d.countedCash) || 0) + (Number(d.countedMobileMoney) || 0) + (Number(d.countedBank) || 0);
  }
  return Number(d.countedBalance ?? 0);
}
