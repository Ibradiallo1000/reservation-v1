// Treasury — Expenses. When status → paid, record ledger transaction.
// Phase 1: Multi-level approval (pending_manager → pending_accountant → pending_ceo → approved).
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
import { financialAccountRef } from "./financialAccounts";
import { ledgerDocIdFromFinancialAccountData } from "./ledgerAccounts";
import {
  getExpenseApprovalThresholds,
  getInitialExpenseStatus,
} from "@/modules/compagnie/settings/expenseApprovalSettings";
import { createCompanyNotification, notifyCompanyRoles } from "@/shared/services/companyNotifications";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import {
  applyFinancialTransactionInExistingFirestoreTransaction,
} from "./financialTransactions";

const EXPENSES_COLLECTION = "expenses";
const EXPENSE_RESERVE_ACCOUNT_ID = "company_expense_reserve";

/** Pending states route to the correct approver; approved/rejected/paid are terminal. */
export type ExpenseStatus =
  | "pending"
  | "pending_manager"
  | "pending_accountant"
  | "pending_ceo"
  | "approved"
  | "rejected"
  | "paid";

/** Legacy: "pending" is treated as pending_manager for backward compatibility. */
export const PENDING_STATUSES: ExpenseStatus[] = [
  "pending",
  "pending_manager",
  "pending_accountant",
  "pending_ceo",
];

export type ExpenseType = "agency" | "company";

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
  /** Phase 1: agency = paid from agency_cash; company = paid from company bank/mobile. */
  expenseType?: ExpenseType | null;
  category: string;
  expenseCategory?: ExpenseCategory | string | null;
  description: string;
  amount: number;
  accountId: string;
  status: ExpenseStatus;
  approvedBy: string | null;
  approvedAt: Timestamp | null;
  rejectedBy: string | null;
  rejectedAt: Timestamp | null;
  rejectionReason: string | null;
  paidAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  vehicleId?: string | null;
  tripId?: string | null;
  linkedMaintenanceId?: string | null;
  linkedPayableId?: string | null;
  expenseDate?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  receiptUrls?: string[] | null;
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

/** Resolve expenseType from account: agency_cash → agency, else company. */
async function getExpenseTypeFromAccount(
  companyId: string,
  accountId: string
): Promise<ExpenseType> {
  const snap = await getDoc(financialAccountRef(companyId, accountId));
  const accountType = snap.exists() ? (snap.data() as { accountType?: string }).accountType : "";
  return accountType === "agency_cash" ? "agency" : "company";
}

/** Create expense (initial status from thresholds). agency_accountant submits → pending_manager / pending_accountant / pending_ceo. */
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
  supplierId?: string | null;
  supplierName?: string | null;
  receiptUrls?: string[] | null;
}): Promise<string> {
  const thresholds = await getExpenseApprovalThresholds(params.companyId);
  const initialStatus = getInitialExpenseStatus(params.amount, thresholds);
  const expenseType = await getExpenseTypeFromAccount(params.companyId, params.accountId);

  const ref = doc(expensesRef(params.companyId));
  const now = Timestamp.now();
  const data: Record<string, unknown> = {
    companyId: params.companyId,
    agencyId: params.agencyId ?? null,
    expenseType,
    category: params.category,
    description: params.description,
    amount: params.amount,
    accountId: params.accountId,
    status: initialStatus,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
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
  if (params.supplierId != null) data.supplierId = params.supplierId;
  if (params.supplierName != null) data.supplierName = params.supplierName;
  if (params.receiptUrls != null) data.receiptUrls = params.receiptUrls;
  await setDoc(ref, data);
  const title = "Nouvelle dépense soumise";
  const body = `${params.description.slice(0, 80)} — ${formatCurrency(params.amount)} en attente de validation.`;
  try {
    await createCompanyNotification({
      companyId: params.companyId,
      type: "expense_submitted",
      entityType: "expense",
      entityId: ref.id,
      title,
      body,
      agencyId: params.agencyId,
      expenseId: ref.id,
      link: `/compagnie/${params.companyId}/accounting/expenses`,
    });
    await notifyCompanyRoles({
      companyId: params.companyId,
      roles: ["chefAgence", "company_accountant", "financial_director", "admin_compagnie"],
      type: "expense_submitted",
      entityType: "expense",
      entityId: ref.id,
      title,
      body,
      agencyId: params.agencyId,
      expenseId: ref.id,
      link: `/compagnie/${params.companyId}/accounting/expenses`,
    });
  } catch (_) {
    // Notification failures must not block expense creation.
  }
  return ref.id;
}

/** Roles that can approve at each level. */
const AGENCY_MANAGER_ROLES = ["chefAgence", "admin_compagnie"];
const ACCOUNTANT_ROLES = ["company_accountant", "financial_director", "admin_compagnie"];
const CEO_ROLES = ["admin_compagnie"];

/** Normalize legacy "pending" to pending_manager for workflow. */
function effectiveStatus(data: ExpenseDoc): ExpenseStatus {
  const s = data.status;
  return s === "pending" ? "pending_manager" : s;
}

/**
 * Multi-level approval:
 * - pending_manager: agency_manager approves (if amount ≤ agencyManagerLimit → approved; else → pending_accountant).
 * - pending_accountant: company_accountant approves (if amount ≤ accountantLimit → approved; else → pending_ceo).
 * - pending_ceo: CEO approves → approved.
 * Ledger transaction is written when status becomes "paid" (in payExpense).
 */
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
  const status = effectiveStatus(data);
  const amount = Number(data.amount) ?? 0;

  if (status === "approved" || status === "paid") throw new Error("Cette dépense est déjà approuvée ou payée.");
  if (status === "rejected") throw new Error("Cette dépense a été refusée.");

  const thresholds = await getExpenseApprovalThresholds(companyId);
  const role = (approvedByRole ?? "").toString();

  if (status === "pending_manager") {
    if (!AGENCY_MANAGER_ROLES.includes(role)) {
      throw new Error("Seul le chef d'agence (ou le CEO) peut approuver cette dépense.");
    }
    if (amount <= thresholds.agencyManagerLimit) {
      await updateDoc(ref, {
        status: "approved",
        approvedBy,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await notifyCompanyRoles({
          companyId,
          roles: ["company_accountant", "financial_director", "admin_compagnie"],
          type: "expense_approved",
          entityType: "expense",
          entityId: expenseId,
          title: "Dépense approuvée",
          body: `Une dépense a été approuvée au niveau chef d'agence.`,
          agencyId: data.agencyId,
          expenseId,
          link: `/compagnie/${companyId}/accounting/expenses`,
        });
      } catch (_) {}
      return;
    }
    await updateDoc(ref, {
      status: "pending_accountant",
      updatedAt: serverTimestamp(),
    });
    try {
      await notifyCompanyRoles({
        companyId,
        roles: ["company_accountant", "financial_director", "admin_compagnie"],
        type: "expense_submitted",
        entityType: "expense",
        entityId: expenseId,
        title: "Dépense en attente chef comptable",
        body: `Une dépense requiert validation du chef comptable.`,
        agencyId: data.agencyId,
        expenseId,
        link: `/compagnie/${companyId}/accounting/expenses`,
      });
    } catch (_) {}
    return;
  }

  if (status === "pending_accountant") {
    if (!ACCOUNTANT_ROLES.includes(role)) {
      throw new Error("Seul le chef comptable (ou le CEO) peut approuver cette dépense.");
    }
    if (amount <= thresholds.accountantLimit) {
      await updateDoc(ref, {
        status: "approved",
        approvedBy,
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      try {
        await notifyCompanyRoles({
          companyId,
          roles: ["admin_compagnie"],
          type: "expense_approved",
          entityType: "expense",
          entityId: expenseId,
          title: "Dépense approuvée",
          body: `Une dépense a été approuvée par le chef comptable.`,
          agencyId: data.agencyId,
          expenseId,
          link: "/compagnie/" + companyId + "/ceo-expenses",
        });
      } catch (_) {}
      return;
    }
    await updateDoc(ref, {
      status: "pending_ceo",
      updatedAt: serverTimestamp(),
    });
    try {
      await notifyCompanyRoles({
        companyId,
        roles: ["admin_compagnie"],
        type: "expense_submitted",
        entityType: "expense",
        entityId: expenseId,
        title: "Dépense en attente CEO",
        body: `Une dépense dépasse le seuil comptable et attend l'approbation CEO.`,
        agencyId: data.agencyId,
        expenseId,
        link: "/compagnie/" + companyId + "/ceo-expenses",
      });
    } catch (_) {}
    return;
  }

  if (status === "pending_ceo") {
    if (!CEO_ROLES.includes(role)) {
      throw new Error("Seul le CEO peut approuver cette dépense.");
    }
    await updateDoc(ref, {
      status: "approved",
      approvedBy,
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    try {
      await notifyCompanyRoles({
        companyId,
        roles: ["company_accountant", "financial_director", "chefAgence"],
        type: "expense_approved",
        entityType: "expense",
        entityId: expenseId,
        title: "Dépense approuvée par le CEO",
        body: `Une dépense a été approuvée au niveau CEO.`,
        agencyId: data.agencyId,
        expenseId,
        link: `/compagnie/${companyId}/accounting/expenses`,
      });
    } catch (_) {}
  }
}

/** Reject expense (any approver for current step can reject). */
export async function rejectExpense(
  companyId: string,
  expenseId: string,
  rejectedBy: string,
  rejectionReason: string,
  rejectedByRole?: string | null
): Promise<void> {
  const ref = expenseRef(companyId, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Dépense introuvable.");
  const data = snap.data() as ExpenseDoc;
  const status = effectiveStatus(data);

  if (status === "approved" || status === "paid") throw new Error("Impossible de refuser une dépense déjà approuvée ou payée.");
  if (status === "rejected") throw new Error("Cette dépense a déjà été refusée.");

  const role = (rejectedByRole ?? "").toString();
  const canReject =
    (status === "pending_manager" && AGENCY_MANAGER_ROLES.includes(role)) ||
    (status === "pending_accountant" && ACCOUNTANT_ROLES.includes(role)) ||
    (status === "pending_ceo" && CEO_ROLES.includes(role));

  if (!canReject) {
    throw new Error("Vous n'êtes pas autorisé à refuser cette dépense à ce stade.");
  }

  await updateDoc(ref, {
    status: "rejected",
    rejectedBy,
    rejectedAt: serverTimestamp(),
    rejectionReason: rejectionReason?.trim()?.slice(0, 500) ?? "",
    updatedAt: serverTimestamp(),
  });
  try {
    await notifyCompanyRoles({
      companyId,
      roles: ["company_accountant", "financial_director", "chefAgence", "agency_accountant", "admin_compagnie"],
      type: "expense_rejected",
      entityType: "expense",
      entityId: expenseId,
      title: "Dépense refusée",
      body: `Une dépense a été refusée: ${(rejectionReason || "").slice(0, 80)}`,
      agencyId: data.agencyId,
      expenseId,
      link: `/compagnie/${companyId}/accounting/expenses`,
    });
  } catch (_) {}
}

/**
 * Mark expense as paid: écriture ledger + statut `paid` dans la même transaction Firestore.
 * Si l’écriture ledger échoue, la dépense reste `approved`.
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
    const mirroredAccountType = String((sourceSnap.data() as { accountType?: string }).accountType ?? "");
    const mirroredAgencyId = data.agencyId ?? null;

    const debitLedgerId = ledgerDocIdFromFinancialAccountData(
      sourceSnap.exists() ? (sourceSnap.data() as { accountType?: string; agencyId?: string | null }) : {}
    );
    if (!debitLedgerId) throw new Error("[expenses] Compte source sans mapping ledger.");

    await applyFinancialTransactionInExistingFirestoreTransaction(tx, {
      companyId,
      type: "expense",
      expenseDebitLedgerDocId: debitLedgerId,
      source: mirroredAccountType.includes("bank")
        ? "bank"
        : mirroredAccountType.includes("mobile")
          ? "mobile_money"
          : "cash",
      amount,
      currency,
      agencyId: mirroredAgencyId,
      referenceType: "expense",
      referenceId: expenseId,
    });

    const now = Timestamp.now();
    tx.update(ref, {
      status: "paid",
      paidAt: now,
      updatedAt: serverTimestamp(),
    });
  });
  try {
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() as ExpenseDoc) : null;
    await notifyCompanyRoles({
      companyId,
      roles: ["company_accountant", "financial_director", "chefAgence", "agency_accountant", "admin_compagnie"],
      type: "expense_paid",
      entityType: "expense",
      entityId: expenseId,
      title: "Dépense payée",
      body: `Une dépense a été payée et comptabilisée.`,
      agencyId: data?.agencyId ?? null,
      expenseId,
      link: `/compagnie/${companyId}/accounting/expenses`,
    });
  } catch (err) {
    console.error("[expenses] Notification expense_paid échouée après payExpense.", { companyId, expenseId, err });
  }
}

/** List expenses (optionally by agency, status, or statusIn for multiple pending statuses). */
export async function listExpenses(
  companyId: string,
  options?: {
    agencyId?: string | null;
    status?: ExpenseStatus;
    /** Use to fetch all "pending" (e.g. pending_manager, pending_accountant, pending_ceo). Max 10. */
    statusIn?: ExpenseStatus[];
    limitCount?: number;
  }
): Promise<(ExpenseDoc & { id: string })[]> {
  const ref = expensesRef(companyId);
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.agencyId !== undefined) {
    if (options.agencyId === null) constraints.push(where("agencyId", "==", null));
    else constraints.push(where("agencyId", "==", options.agencyId));
  }
  if (options?.statusIn != null && options.statusIn.length > 0) {
    constraints.push(where("status", "in", options.statusIn.slice(0, 10)));
  } else if (options?.status) {
    constraints.push(where("status", "==", options.status));
  }
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExpenseDoc & { id: string }));
}
