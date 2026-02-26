// Phase C1.1 — Financial governance. companies/{companyId}/financialSettings/current
import type { Timestamp } from "firebase/firestore";

export interface FinancialSettingsDoc {
  paymentApprovalThreshold: number;
  requireCeoForPayablesAbove: number;
  requireCeoForBankTransfer: boolean;
  /** Phase C3: maintenance expense above this requires company_accountant or admin_compagnie approval. */
  maintenanceApprovalThreshold?: number;
  /** Phase C3: fuel expense above this triggers anomaly automatically. */
  fuelExpenseAnomalyLimit?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FinancialSettingsUpdate {
  paymentApprovalThreshold?: number;
  requireCeoForPayablesAbove?: number;
  requireCeoForBankTransfer?: boolean;
  maintenanceApprovalThreshold?: number;
  fuelExpenseAnomalyLimit?: number;
}

export const FINANCIAL_SETTINGS_DOC_ID = "current";

/** Safe defaults when document does not exist. */
export const DEFAULT_FINANCIAL_SETTINGS: FinancialSettingsDoc = {
  paymentApprovalThreshold: 1_000_000,
  requireCeoForPayablesAbove: 5_000_000,
  requireCeoForBankTransfer: true,
  maintenanceApprovalThreshold: 500_000,
  fuelExpenseAnomalyLimit: 200_000,
  createdAt: {} as Timestamp,
  updatedAt: {} as Timestamp,
};

export const FINANCIAL_SETTINGS_COLLECTION = "financialSettings";
