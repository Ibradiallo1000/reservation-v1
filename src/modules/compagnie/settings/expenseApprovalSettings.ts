/**
 * Company expense approval thresholds.
 * Canonical path: companies/{companyId}/financialSettings/current
 * Legacy path (read fallback): companies/{companyId}/settings/financial
 */

import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export const SETTINGS_COLLECTION = "settings";
export const FINANCIAL_DOC_ID = "financial";
export const FINANCIAL_SETTINGS_COLLECTION = "financialSettings";
export const FINANCIAL_SETTINGS_CURRENT_DOC_ID = "current";

export interface ExpenseApprovalThresholds {
  agencyManagerLimit: number;
  accountantLimit: number;
  ceoLimit: number;
}

export interface FinancialSettingsDoc {
  expenseApprovalThresholds: ExpenseApprovalThresholds;
  updatedAt: Timestamp;
  updatedBy?: string | null;
}

const DEFAULT_THRESHOLDS: ExpenseApprovalThresholds = {
  agencyManagerLimit: 100_000,
  accountantLimit: 500_000,
  ceoLimit: 500_000,
};

function financialSettingsRef(companyId: string) {
  return doc(
    db,
    "companies",
    companyId,
    FINANCIAL_SETTINGS_COLLECTION,
    FINANCIAL_SETTINGS_CURRENT_DOC_ID
  );
}

function legacyFinancialSettingsRef(companyId: string) {
  return doc(db, "companies", companyId, SETTINGS_COLLECTION, FINANCIAL_DOC_ID);
}

/** Get expense approval thresholds; fallback to defaults if document does not exist. */
export async function getExpenseApprovalThresholds(
  companyId: string
): Promise<ExpenseApprovalThresholds> {
  const [snap, legacySnap] = await Promise.all([
    getDoc(financialSettingsRef(companyId)),
    getDoc(legacyFinancialSettingsRef(companyId)).catch(() => null),
  ]);
  if (!snap.exists() && (!legacySnap || !legacySnap.exists())) return { ...DEFAULT_THRESHOLDS };
  const data = (snap.exists() ? snap.data() : legacySnap?.data()) as Partial<FinancialSettingsDoc>;
  const t = data.expenseApprovalThresholds;
  return {
    agencyManagerLimit: Number(t?.agencyManagerLimit ?? DEFAULT_THRESHOLDS.agencyManagerLimit),
    accountantLimit: Number(t?.accountantLimit ?? DEFAULT_THRESHOLDS.accountantLimit),
    ceoLimit: Number(t?.ceoLimit ?? DEFAULT_THRESHOLDS.ceoLimit),
  };
}

/** Update expense approval thresholds (admin_compagnie / company_accountant at rules level). */
export async function updateExpenseApprovalThresholds(
  companyId: string,
  thresholds: Partial<ExpenseApprovalThresholds>,
  updatedBy?: string | null
): Promise<void> {
  const current = await getExpenseApprovalThresholds(companyId);
  const next: ExpenseApprovalThresholds = {
    agencyManagerLimit: thresholds.agencyManagerLimit ?? current.agencyManagerLimit,
    accountantLimit: thresholds.accountantLimit ?? current.accountantLimit,
    ceoLimit: thresholds.ceoLimit ?? current.ceoLimit,
  };
  await setDoc(
    financialSettingsRef(companyId),
    {
      expenseApprovalThresholds: next,
      updatedAt: serverTimestamp(),
      updatedBy: updatedBy ?? null,
    },
    { merge: true }
  );
}

/** Compute initial approval status for a new expense based on amount and thresholds. */
export function getInitialExpenseStatus(
  amount: number,
  thresholds: ExpenseApprovalThresholds
): "pending_manager" | "pending_accountant" | "pending_ceo" {
  if (amount <= thresholds.agencyManagerLimit) return "pending_manager";
  if (amount <= thresholds.accountantLimit) return "pending_accountant";
  return "pending_ceo";
}
