// Treasury — Financial traceability. Balance only via financialMovements.
import type { Timestamp } from "firebase/firestore";

/** Phase C2: company_bank, company_mobile_money, agency_cash are primary. No agency-level banks for new setups. */
export const FINANCIAL_ACCOUNT_TYPES = [
  "agency_cash",
  "agency_bank", // legacy; new: use company_bank only
  "company_bank",
  "company_mobile_money",
  "mobile_money", // legacy alias for company_mobile_money
  "expense_reserve",
  "payroll_account",
  "internal_transfer_account",
] as const;

export type FinancialAccountType = (typeof FINANCIAL_ACCOUNT_TYPES)[number];

/**
 * Hot document contention (Phase 6): Firestore write limit ~1 write/sec per document.
 * For accountType == "company_bank", optional subAccounts company_bank_1, company_bank_2, ...
 * can be created to shard writes. Future scaling: route movements to different shard IDs.
 * No migration now — support documented only.
 */
export interface FinancialAccountDoc {
  companyId: string;
  agencyId: string | null;
  accountType: FinancialAccountType;
  accountName: string;
  currency: string;
  currentBalance: number;
  isActive: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  description?: string | null;
}

export const FINANCIAL_MOVEMENT_TYPES = [
  "revenue_cash",
  "revenue_online",
  "deposit_to_bank",
  "withdrawal_from_bank",
  "internal_transfer",
  "expense_payment",
  "payable_payment",
  "salary_payment",
  "manual_adjustment",
] as const;

export type FinancialMovementType = (typeof FINANCIAL_MOVEMENT_TYPES)[number];

export const REFERENCE_TYPES = [
  "shift",
  "reservation",
  "expense",
  "deposit",
  "withdrawal",
  "transfer",
  "payable_payment",
  "internal_transfer",
  "agency_deposit",
  "bank_withdrawal",
  "mobile_to_bank",
  "mobile_expense",
] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const ENTRY_TYPES = ["debit", "credit"] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const RECONCILIATION_STATUSES = ["pending", "reconciled", "failed"] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export interface FinancialMovementDoc {
  companyId: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  currency: string;
  movementType: FinancialMovementType;
  referenceType: ReferenceType;
  referenceId: string;
  /** Idempotency: unique per (referenceType, referenceId). Prevents double accounting. */
  uniqueReferenceKey: string;
  agencyId: string;
  performedBy: string;
  performedAt: Timestamp;
  notes: string | null;
  entryType: EntryType;
  reconciliationStatus: ReconciliationStatus;
  externalReferenceId?: string | null;
  settlementDate?: Timestamp | null;
  performedByRole?: string | null;
  /** Phase C / C2: approval workflow and audit. */
  approvedBy?: string | null;
  approvedByRole?: string | null;
  approvedAt?: Timestamp | null;
  updatedAt?: Timestamp;
}

export function agencyCashAccountId(agencyId: string): string {
  return `${agencyId}_agency_cash`;
}
export function agencyBankAccountId(agencyId: string): string {
  return `${agencyId}_agency_bank`;
}

/** Id du compte financier pour une banque de la compagnie (niveau compagnie). */
export function companyBankAccountId(companyBankDocId: string): string {
  return `company_bank_${companyBankDocId}`;
}

/** Phase C2: id du compte mobile money compagnie. */
export function companyMobileMoneyAccountId(docId: string): string {
  return `company_mobile_money_${docId}`;
}
