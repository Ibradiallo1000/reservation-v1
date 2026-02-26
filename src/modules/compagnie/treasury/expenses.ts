// Treasury — Expenses. When status → paid, record financialMovement transactionally.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { recordMovementInTransaction } from "./financialMovements";
import { financialAccountRef } from "./financialAccounts";

const EXPENSES_COLLECTION = "expenses";
const EXPENSE_RESERVE_ACCOUNT_ID = "company_expense_reserve";

export type ExpenseStatus = "pending" | "approved" | "paid";

/** Phase C3: standardized categories for analytics and profit injection. */
export const EXPENSE_CATEGORIES = [
  "fuel",
  "maintenance",
  "salary",
  "toll",
  "operational",
  "supplier_payment",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseDoc {
  companyId: string;
  agencyId: string | null;
  category: string;
  /** Phase C3: preferred category for analytics; falls back to category if absent. */
  expenseCategory?: ExpenseCategory | string | null;
  description: string;
  amount: number;
  accountId: string;
  status: ExpenseStatus;
  approvedBy: string | null;
  approvedAt: Timestamp | null;
  paidAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  /** Phase C3: optional links for operational integration. */
  vehicleId?: string | null;
  tripId?: string | null;
  linkedMaintenanceId?: string | null;
  linkedPayableId?: string | null;
  /** Optional date of expense (yyyy-MM-dd) for fuel/date aggregation. */
  expenseDate?: string | null;
}

function expensesRef(companyId: string) {
  return collection(db, `companies/${companyId}/${EXPENSES_COLLECTION}`);
}

export function expenseRef(companyId: string, expenseId: string) {
  return doc(db, `companies/${companyId}/${EXPENSES_COLLECTION}/${expenseId}`);
}

/** Ensure company-level expense_reserve account exists. */
export async function ensureExpenseReserveAccount(companyId: string, currency: string): Promise<void> {
  const ref = financialAccountRef(companyId, EXPENSE_RESERVE_ACCOUNT_ID);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    companyId,
    agencyId: null,
    accountType: "expense_reserve",
    accountName: "Réserve dépenses",
    currency,
    currentBalance: 0,
    isActive: true,
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
}

/** Create expense (pending). Phase C3: optional expenseCategory, vehicleId, tripId, linkedMaintenanceId, linkedPayableId, expenseDate. */
export async function createExpense(params: {
  companyId: string;
  agencyId: string | null;
  category: string;
  description: string;
  amount: number;
  accountId: string;
  createdBy: string;
  expenseCategory?: ExpenseCategory | string | null;
  vehicleId?: string | null;
  tripId?: string | null;
  linkedMaintenanceId?: string | null;
  linkedPayableId?: string | null;
  expenseDate?: string | null;
}): Promise<string> {
  const ref = doc(expensesRef(params.companyId));
  const now = Timestamp.now();
  const data: Record<string, unknown> = {
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    category: params.category,
    description: params.description,
    amount: params.amount,
    accountId: params.accountId,
    status: "pending",
    approvedBy: null,
    approvedAt: null,
    paidAt: null,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: serverTimestamp(),
  };
  if (params.expenseCategory != null) data.expenseCategory = params.expenseCategory;
  if (params.vehicleId != null) data.vehicleId = params.vehicleId;
  if (params.tripId != null) data.tripId = params.tripId;
  if (params.linkedMaintenanceId != null) data.linkedMaintenanceId = params.linkedMaintenanceId;
  if (params.linkedPayableId != null) data.linkedPayableId = params.linkedPayableId;
  if (params.expenseDate != null) data.expenseDate = params.expenseDate;
  await setDoc(ref, data);
  return ref.id;
}

/** Phase C3: roles allowed to approve maintenance above threshold. */
const MAINTENANCE_APPROVAL_ROLES = ["company_accountant", "admin_compagnie"];

/** Approve expense (agency manager or CEO). Phase C3: maintenance above threshold requires company_accountant or admin_compagnie. */
export async function approveExpense(
  companyId: string,
  expenseId: string,
  approvedBy: string,
  approvedByRole?: string | null
): Promise<void> {
  const ref = expenseRef(companyId, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Dépense introuvable.");
  const data = snap.data() as ExpenseDoc;
  const category = (data.expenseCategory ?? data.category ?? "").toString();
  const amount = Number(data.amount) ?? 0;
  if (category === "maintenance" && approvedByRole != null) {
    const { getFinancialSettings } = await import("@/modules/compagnie/finance/financialSettingsService");
    const settings = await getFinancialSettings(companyId);
    const threshold = Number(settings.maintenanceApprovalThreshold ?? 0) || 500_000;
    if (amount > threshold && !MAINTENANCE_APPROVAL_ROLES.includes(approvedByRole)) {
      throw new Error(
        `Les dépenses de maintenance au-dessus de ${threshold.toLocaleString("fr-FR")} doivent être approuvées par le comptable compagnie ou le CEO.`
      );
    }
  }
  await updateDoc(ref, {
    status: "approved",
    approvedBy,
    approvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark expense as paid: record movement (source account → expense_reserve) and set paidAt.
 * Fails if insufficient balance. Runs in a single transaction.
 */
export async function payExpense(
  companyId: string,
  expenseId: string,
  performedBy: string,
  currency: string
): Promise<void> {
  const ref = expenseRef(companyId, expenseId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Dépense introuvable.");
    const data = snap.data() as ExpenseDoc;
    if (data.status === "paid") throw new Error("Dépense déjà payée.");
    if (data.status !== "approved") throw new Error("Seules les dépenses approuvées peuvent être payées.");

    const amount = Number(data.amount);
    if (amount <= 0) throw new Error("Montant invalide.");

    const sourceAccountRef = financialAccountRef(companyId, data.accountId);
    const sourceSnap = await tx.get(sourceAccountRef);
    if (!sourceSnap.exists()) throw new Error("Compte source introuvable.");
    const balance = Number((sourceSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte source.");

    const reserveRef = financialAccountRef(companyId, EXPENSE_RESERVE_ACCOUNT_ID);
    const reserveSnap = await tx.get(reserveRef);
    if (!reserveSnap.exists()) {
      tx.set(reserveRef, {
        companyId,
        agencyId: null,
        accountType: "expense_reserve",
        accountName: "Réserve dépenses",
        currency,
        currentBalance: 0,
        isActive: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const now = Timestamp.now();
    await recordMovementInTransaction(tx, {
      companyId,
      fromAccountId: data.accountId,
      toAccountId: EXPENSE_RESERVE_ACCOUNT_ID,
      amount,
      currency,
      movementType: "expense_payment",
      referenceType: "expense",
      referenceId: expenseId,
      agencyId: data.agencyId ?? "",
      performedBy,
      performedAt: now,
      notes: data.description || null,
    });

    tx.update(ref, {
      status: "paid",
      paidAt: now,
      updatedAt: serverTimestamp(),
    });
  });
}

/** List expenses (optionally by agency or status). */
export async function listExpenses(
  companyId: string,
  options?: { agencyId?: string | null; status?: ExpenseStatus; limitCount?: number }
): Promise<(ExpenseDoc & { id: string })[]> {
  const ref = expensesRef(companyId);
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.agencyId !== undefined) {
    if (options.agencyId === null) constraints.push(where("agencyId", "==", null));
    else constraints.push(where("agencyId", "==", options.agencyId));
  }
  if (options?.status) constraints.push(where("status", "==", options.status));
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseDoc & { id: string }));
}
