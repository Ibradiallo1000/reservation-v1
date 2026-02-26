// Treasury — Immutable ledger. All balance changes ONLY via this module, inside runTransaction.
// PART 3: Never setDoc/updateDoc on currentBalance outside this module; always read account in tx before writing.
//
// Movement log consistency (PART 6): every operation that modifies money must write a financialMovement.
// Currently integrated: shift validation (sessionService, shiftApi) → revenue_cash; expense payment (expenses.payExpense) → expense_payment.
// When adding: mobile money deposit (payment confirmed) → revenue_online to mobile_money account; treasury transfer/deposit → use recordMovementInTransaction in same tx.
import type { Transaction } from "firebase/firestore";
import {
  doc,
  collection,
  serverTimestamp,
  increment,
  Timestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialMovementType, ReferenceType, EntryType, ReconciliationStatus } from "./types";
import { financialAccountRef } from "./financialAccounts";

const MOVEMENTS_COLLECTION = "financialMovements";

function movementsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${MOVEMENTS_COLLECTION}`);
}

/** Format: referenceType_referenceId. Ensures one movement per business event (idempotency). */
export function uniqueReferenceKey(referenceType: ReferenceType, referenceId: string): string {
  return `${referenceType}_${referenceId}`;
}

export interface RecordMovementParams {
  companyId: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  currency: string;
  movementType: FinancialMovementType;
  referenceType: ReferenceType;
  referenceId: string;
  agencyId: string;
  performedBy: string;
  performedAt?: Timestamp;
  notes?: string | null;
  performedByRole?: string | null;
  externalReferenceId?: string | null;
  settlementDate?: Timestamp | null;
  /** When provided (e.g. internal_transfer double-entry), use this; else derive from toAccountId. */
  entryType?: EntryType;
  approvedBy?: string | null;
  approvedByRole?: string | null;
}

/** Idempotency collection: one doc per uniqueReferenceKey. Client transactions cannot run queries; we use a doc ref. */
const IDEMPOTENCY_COLLECTION = "financialMovementIdempotency";

function idempotencyRef(companyId: string, uniqueKey: string) {
  return doc(db, `companies/${companyId}/${IDEMPOTENCY_COLLECTION}/${uniqueKey}`);
}

/**
 * Idempotency: one movement per uniqueReferenceKey (referenceType_referenceId).
 * Prevents double accounting when the same business event (e.g. shift validation) is submitted twice.
 * Uses a sentinel document so we can tx.get(docRef) inside the transaction (client SDK does not support tx.get(query)).
 * Exported for Phase C2 internal transfer (one sentinel per transfer, then two movement records).
 */
export async function ensureUniqueReferenceKeyInTransaction(
  tx: Transaction,
  companyId: string,
  key: string
): Promise<void> {
  const ref = idempotencyRef(companyId, key);
  const snap = await tx.get(ref);
  if (snap.exists()) throw new Error("Un mouvement existe déjà pour cette référence (idempotence).");
  tx.set(ref, { createdAt: Timestamp.now() });
}

/**
 * Call ONLY from inside an existing transaction (async callback).
 * All balance updates use runTransaction; never setDoc/updateDoc on currentBalance elsewhere.
 * Reads account doc inside transaction before writing (PART 3).
 * Guard: if fromAccount exists and (currentBalance - amount) < 0 → abort (no negative balance).
 */
/** Returns the created movement document id, or empty string if amount <= 0. */
export async function recordMovementInTransaction(tx: Transaction, params: RecordMovementParams): Promise<string> {
  const amount = Number(params.amount);
  if (amount <= 0) return "";

  const key = uniqueReferenceKey(params.referenceType, params.referenceId);
  await ensureUniqueReferenceKeyInTransaction(tx, params.companyId, key);

  const fromRef = params.fromAccountId ? financialAccountRef(params.companyId, params.fromAccountId) : null;
  const toRef = params.toAccountId ? financialAccountRef(params.companyId, params.toAccountId) : null;

  if (fromRef) {
    const fromSnap = await tx.get(fromRef);
    if (!fromSnap.exists()) throw new Error("Compte source introuvable.");
    const balance = Number((fromSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte source.");
  }

  const performedAt = params.performedAt ?? Timestamp.now();
  const entryType: EntryType =
    params.entryType ?? (params.toAccountId != null ? "credit" : "debit");
  const reconciliationStatus: ReconciliationStatus = "pending";

  if (fromRef) {
    tx.update(fromRef, {
      currentBalance: increment(-amount),
      updatedAt: serverTimestamp(),
    });
  }
  if (toRef) {
    tx.update(toRef, {
      currentBalance: increment(amount),
      updatedAt: serverTimestamp(),
    });
  }

  const movementRef = doc(movementsRef(params.companyId));
  tx.set(movementRef, {
    companyId: params.companyId,
    fromAccountId: params.fromAccountId ?? null,
    toAccountId: params.toAccountId ?? null,
    amount,
    currency: params.currency,
    movementType: params.movementType,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    uniqueReferenceKey: key,
    agencyId: params.agencyId,
    performedBy: params.performedBy,
    performedAt,
    notes: params.notes ?? null,
    entryType,
    reconciliationStatus,
    externalReferenceId: params.externalReferenceId ?? null,
    settlementDate: params.settlementDate ?? null,
    performedByRole: params.performedByRole ?? null,
    approvedBy: params.approvedBy ?? null,
    approvedByRole: params.approvedByRole ?? null,
  });
  return movementRef.id;
}

/**
 * Standalone: run a transaction to record one movement. Use when not already inside a tx.
 */
export async function recordMovement(params: RecordMovementParams): Promise<void> {
  const amount = Number(params.amount);
  if (amount <= 0) return;

  await runTransaction(db, async (tx) => {
    await recordMovementInTransaction(tx, params);
  });
}

/** Movement doc ref for update (reconciliationStatus only). Rules: admin_compagnie | company_accountant. */
export function financialMovementRef(companyId: string, movementId: string) {
  return doc(db, `companies/${companyId}/${MOVEMENTS_COLLECTION}/${movementId}`);
}

/**
 * Update reconciliationStatus only. Allowed by Firestore rules for admin_compagnie | company_accountant.
 * No update/delete on other fields; ledger remains auditable.
 */
export async function updateMovementReconciliationStatus(
  companyId: string,
  movementId: string,
  reconciliationStatus: ReconciliationStatus
): Promise<void> {
  const { updateDoc } = await import("firebase/firestore");
  const ref = financialMovementRef(companyId, movementId);
  await updateDoc(ref, {
    reconciliationStatus,
    updatedAt: serverTimestamp(),
  });
}
