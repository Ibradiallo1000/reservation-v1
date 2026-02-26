// Phase C1.1 — Financial settings (thresholds, CEO requirements).
import { doc, getDoc, setDoc, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialSettingsDoc, FinancialSettingsUpdate } from "./financialSettingsTypes";
import {
  DEFAULT_FINANCIAL_SETTINGS,
  FINANCIAL_SETTINGS_COLLECTION,
  FINANCIAL_SETTINGS_DOC_ID,
} from "./financialSettingsTypes";

function settingsRef(companyId: string) {
  return doc(db, "companies", companyId, FINANCIAL_SETTINGS_COLLECTION, FINANCIAL_SETTINGS_DOC_ID);
}

/** Get settings; fallback to safe defaults if document does not exist. */
export async function getFinancialSettings(companyId: string): Promise<FinancialSettingsDoc> {
  const snap = await getDoc(settingsRef(companyId));
  if (!snap.exists()) return { ...DEFAULT_FINANCIAL_SETTINGS } as FinancialSettingsDoc;
  const data = snap.data() as Partial<FinancialSettingsDoc>;
  return {
    paymentApprovalThreshold: Number(data.paymentApprovalThreshold ?? DEFAULT_FINANCIAL_SETTINGS.paymentApprovalThreshold),
    requireCeoForPayablesAbove: Number(data.requireCeoForPayablesAbove ?? DEFAULT_FINANCIAL_SETTINGS.requireCeoForPayablesAbove),
    requireCeoForBankTransfer: data.requireCeoForBankTransfer ?? DEFAULT_FINANCIAL_SETTINGS.requireCeoForBankTransfer,
    maintenanceApprovalThreshold: Number(data.maintenanceApprovalThreshold ?? DEFAULT_FINANCIAL_SETTINGS.maintenanceApprovalThreshold ?? 500_000),
    fuelExpenseAnomalyLimit: Number(data.fuelExpenseAnomalyLimit ?? DEFAULT_FINANCIAL_SETTINGS.fuelExpenseAnomalyLimit ?? 200_000),
    createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
    updatedAt: (data.updatedAt as Timestamp) ?? Timestamp.now(),
  };
}

/** Update settings (admin_compagnie only at rules level). */
export async function updateFinancialSettings(
  companyId: string,
  data: FinancialSettingsUpdate
): Promise<void> {
  const ref = settingsRef(companyId);
  const snap = await getDoc(ref);
  const now = Timestamp.now();
  const existing = snap.exists() ? (snap.data() as FinancialSettingsDoc) : null;
  const next: FinancialSettingsDoc = {
    paymentApprovalThreshold: data.paymentApprovalThreshold ?? existing?.paymentApprovalThreshold ?? DEFAULT_FINANCIAL_SETTINGS.paymentApprovalThreshold,
    requireCeoForPayablesAbove: data.requireCeoForPayablesAbove ?? existing?.requireCeoForPayablesAbove ?? DEFAULT_FINANCIAL_SETTINGS.requireCeoForPayablesAbove,
    requireCeoForBankTransfer: data.requireCeoForBankTransfer ?? existing?.requireCeoForBankTransfer ?? DEFAULT_FINANCIAL_SETTINGS.requireCeoForBankTransfer,
    maintenanceApprovalThreshold: data.maintenanceApprovalThreshold ?? existing?.maintenanceApprovalThreshold ?? DEFAULT_FINANCIAL_SETTINGS.maintenanceApprovalThreshold ?? 500_000,
    fuelExpenseAnomalyLimit: data.fuelExpenseAnomalyLimit ?? existing?.fuelExpenseAnomalyLimit ?? DEFAULT_FINANCIAL_SETTINGS.fuelExpenseAnomalyLimit ?? 200_000,
    createdAt: (existing?.createdAt as Timestamp) ?? now,
    updatedAt: now,
  };
  await setDoc(ref, { ...next, updatedAt: serverTimestamp() }, { merge: true });
}

/** Convenience: return threshold for payment approval (above = require CEO). */
export async function getFinancialThreshold(companyId: string): Promise<number> {
  const settings = await getFinancialSettings(companyId);
  return settings.paymentApprovalThreshold;
}
