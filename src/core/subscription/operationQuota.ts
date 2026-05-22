import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { normalizePlan, type Plan } from "@/core/subscription/plans";

export const QUOTA_REACHED_ERROR = "QUOTA_REACHED";
export const OPERATION_QUOTA_BLOCKED_MESSAGE =
  "🚫 Vous avez atteint votre limite mensuelle.\nPassez en Premium pour continuer vos ventes.";
export const OPERATION_QUOTA_WARNING_MESSAGE =
  "⚠️ Vous avez utilisé 80% de votre quota.\nPassez en Premium pour éviter un blocage.";
export const OPERATION_QUOTA_BLOCKED_HELP = "Continuez à vendre sans interruption";

export type OperationPlanConfig = {
  price: number;
  includedOperations: number;
  overage: number;
};

export type OperationQuotaCompany = {
  plan?: unknown;
  planId?: unknown;
  currentMonthOperations?: unknown;
  currentMonth?: unknown;
  currentOperationsMonth?: unknown;
};

export type OperationQuotaStatus = {
  company: OperationQuotaCompany;
  planId: Plan;
  planConfig: OperationPlanConfig;
  currentMonthOperations: number;
  includedOperations: number;
  usageRatio: number;
  canPerform: boolean;
  isNearLimit: boolean;
};

export const DEFAULT_OPERATION_PLANS: Record<Plan, OperationPlanConfig> = {
  standard: {
    price: 100000,
    includedOperations: 3000,
    overage: 15,
  },
  premium: {
    price: 300000,
    includedOperations: 10000,
    overage: 10,
  },
};

function currentBillingMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeOperationPlanConfig(
  raw: unknown,
  fallback: OperationPlanConfig
): OperationPlanConfig {
  const data = raw && typeof raw === "object" ? (raw as Partial<OperationPlanConfig>) : {};
  return {
    price: toFiniteNumber(data.price, fallback.price),
    includedOperations: toFiniteNumber(data.includedOperations, fallback.includedOperations),
    overage: toFiniteNumber(data.overage, fallback.overage),
  };
}

function getCurrentUsage(company: OperationQuotaCompany): number {
  return Math.max(0, Math.trunc(Number(company.currentMonthOperations ?? 0) || 0));
}

export function getOperationQuotaStatus(
  company: OperationQuotaCompany,
  plansData: Partial<Record<Plan, OperationPlanConfig>> = {}
): OperationQuotaStatus {
  const planId = normalizePlan(String(company.plan ?? company.planId ?? ""));
  const planConfig = normalizeOperationPlanConfig(
    plansData[planId],
    DEFAULT_OPERATION_PLANS[planId]
  );
  const currentMonthOperations = getCurrentUsage(company);
  const includedOperations = Math.max(0, Number(planConfig.includedOperations) || 0);
  const usageRatio = includedOperations > 0 ? currentMonthOperations / includedOperations : 1;

  return {
    company,
    planId,
    planConfig,
    currentMonthOperations,
    includedOperations,
    usageRatio,
    canPerform: canPerformOperation(company, planConfig),
    isNearLimit: usageRatio >= 0.8,
  };
}

export function canPerformOperation(
  company: OperationQuotaCompany,
  planConfig: OperationPlanConfig
): boolean {
  return getCurrentUsage(company) < Math.max(0, Number(planConfig.includedOperations) || 0);
}

export async function loadOperationPlanSettings(): Promise<Partial<Record<Plan, OperationPlanConfig>>> {
  let plansData: Partial<Record<Plan, OperationPlanConfig>> = {};
  try {
    const plansSnap = await getDoc(doc(db, "adminSettings", "plans"));
    plansData = plansSnap.exists()
      ? (plansSnap.data() as Partial<Record<Plan, OperationPlanConfig>>)
      : {};
  } catch {
    plansData = {};
  }
  return plansData;
}

export async function loadCompanyOperationQuota(companyId: string): Promise<OperationQuotaStatus> {
  const [companySnap, plansData] = await Promise.all([
    getDoc(doc(db, "companies", companyId)),
    loadOperationPlanSettings(),
  ]);
  const company = companySnap.exists()
    ? (companySnap.data() as OperationQuotaCompany)
    : {};

  return getOperationQuotaStatus(company, plansData);
}

export async function initializeOperationsCounter(companyId: string): Promise<void> {
  if (!companyId) return;

  const month = currentBillingMonth();
  await setDoc(
    doc(db, "companies", companyId),
    {
      currentMonth: month,
      currentOperationsMonth: month,
      currentMonthOperations: 0,
      operationsUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function resetOperations(companyId: string): Promise<void> {
  if (!companyId) return;

  const month = currentBillingMonth();
  await setDoc(
    doc(db, "companies", companyId),
    {
      currentMonth: month,
      currentOperationsMonth: month,
      currentMonthOperations: 0,
      operationsUpdatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function createQuotaReachedError(): Error {
  return new Error(QUOTA_REACHED_ERROR);
}

export function isQuotaReachedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message === QUOTA_REACHED_ERROR || message.includes(QUOTA_REACHED_ERROR);
}

export function operationQuotaErrorMessage(error: unknown): string | null {
  return isQuotaReachedError(error) ? OPERATION_QUOTA_BLOCKED_MESSAGE : null;
}

export async function assertAndIncrementOperationInTransaction(
  transaction: Transaction,
  companyRef: DocumentReference,
  plansData: Partial<Record<Plan, OperationPlanConfig>> = {}
): Promise<OperationQuotaStatus> {
  console.log("📥 TRANSACTION START");
  const companySnap = await transaction.get(companyRef);
  if (!companySnap.exists()) {
    throw new Error("Company not found");
  }
  console.log("🏢 COMPANY DATA", companySnap.data());
  const company = companySnap.exists()
    ? (companySnap.data() as OperationQuotaCompany)
    : {};
  const status = getOperationQuotaStatus(company, plansData);
  console.log("📊 CURRENT OPERATIONS", status.currentMonthOperations);
  console.log("📊 LIMIT", status.planConfig?.includedOperations);

  if (!status.canPerform) {
    throw createQuotaReachedError();
  }

  const nextUsage = status.currentMonthOperations + 1;
  const month = currentBillingMonth();
  console.log("INCREMENT operations BEFORE", status.currentMonthOperations);
  console.log("➕ INCREMENTING OPERATIONS");
  transaction.update(
    companyRef,
    {
      currentMonth: month,
      currentOperationsMonth: month,
      currentMonthOperations: nextUsage,
      operationsUpdatedAt: serverTimestamp(),
    }
  );
  console.log("INCREMENT operations AFTER", nextUsage);
  console.log("✅ UPDATED OPERATIONS", nextUsage);

  return {
    ...status,
    currentMonthOperations: nextUsage,
    usageRatio: status.includedOperations > 0 ? nextUsage / status.includedOperations : 1,
    canPerform: nextUsage < status.includedOperations,
    isNearLimit: status.includedOperations > 0 && nextUsage / status.includedOperations >= 0.8,
  };
}

export async function assertCanPerformOperation(companyId: string): Promise<OperationQuotaStatus> {
  const status = await loadCompanyOperationQuota(companyId);
  if (!status.canPerform) {
    throw createQuotaReachedError();
  }
  return status;
}
