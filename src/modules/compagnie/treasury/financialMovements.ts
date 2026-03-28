// Treasury — Mouvements sur financialAccounts (historique / trésorerie interne).
// Les revenus clients ne doivent PAS être « créés » ici lors des validations comptables : le ledger (financialTransactions + accounts) porte l’encaissement.
// Utiliser ce module pour transferts internes, paiements de dépenses, payables, etc. — pas comme source de vérité des ventes.
// PART 3: Never setDoc/updateDoc on currentBalance outside this module; always read account in tx before writing.
import type { Transaction } from "firebase/firestore";
import {
  doc,
  collection,
  getDocs,
  query,
  where,
  limit,
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
  /** Audit: source métier du flux (guichet / online / transfer). */
  sourceType?: "guichet" | "online" | "courrier" | "transfer";
  /** Audit: session source (shiftId / virtualSessionId) si applicable. */
  sourceSessionId?: string | null;
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

/** Check idempotency sentinel in an existing transaction context. */
export async function hasMovementReferenceInTransaction(
  tx: Transaction,
  companyId: string,
  referenceType: ReferenceType,
  referenceId: string
): Promise<boolean> {
  const key = uniqueReferenceKey(referenceType, referenceId);
  const snap = await tx.get(idempotencyRef(companyId, key));
  return snap.exists();
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
    sourceType: params.sourceType ?? null,
    sourceSessionId: params.sourceSessionId ?? null,
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

/** Lookup movement by reference (used by Payment flow idempotence checks). */
export async function findMovementByReference(
  companyId: string,
  referenceId: string
): Promise<string | null> {
  return findMovementByReferenceAndType(companyId, referenceId, "payment");
}

/** Lookup movement by referenceType + referenceId (payment, payment_refund, shift, etc.). */
export async function findMovementByReferenceAndType(
  companyId: string,
  referenceId: string,
  referenceType: ReferenceType
): Promise<string | null> {
  const q = query(
    movementsRef(companyId),
    where("referenceType", "==", referenceType),
    where("referenceId", "==", referenceId),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].id;
}

/**
 * Remboursement : mouvement inverse (débit du compte crédité à la confirmation).
 * Idempotent : si un mouvement payment_refund existe déjà pour ce payment → skip.
 */
export async function createReverseMovement(payment: {
  id: string;
  companyId: string;
  agencyId: string;
  amount: number;
  currency: string;
  channel: "guichet" | "online" | "courrier";
  refundedBy?: string;
}): Promise<void> {
  const amount = Number(payment.amount);
  if (amount <= 0) return;

  const existingRefund = await findMovementByReferenceAndType(
    payment.companyId,
    payment.id,
    "payment_refund"
  );
  if (existingRefund) return;

  const originalMovementId = await findMovementByReference(payment.companyId, payment.id);
  if (!originalMovementId) {
    console.warn("[createReverseMovement] Aucun mouvement payment trouvé pour payment.id:", payment.id);
    return;
  }

  const { getDoc } = await import("firebase/firestore");
  const movRef = doc(db, "companies", payment.companyId, "financialMovements", originalMovementId);
  const movSnap = await getDoc(movRef);
  if (!movSnap.exists()) return;
  const movData = movSnap.data() as { toAccountId?: string | null };
  const fromAccountId = movData?.toAccountId ?? null;
  if (!fromAccountId) {
    console.warn("[createReverseMovement] Mouvement original sans toAccountId.");
    return;
  }

  await recordMovement({
    companyId: payment.companyId,
    fromAccountId,
    toAccountId: null,
    amount,
    currency: payment.currency ?? "XOF",
    movementType: "manual_adjustment",
    referenceType: "payment_refund",
    referenceId: payment.id,
    agencyId: payment.agencyId,
    performedBy: payment.refundedBy ?? "system",
    notes: "Remboursement payment",
    sourceType: payment.channel,
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

/**
 * @deprecated Plus utilisé par les flux produit : les revenus passent par financialTransactions uniquement.
 * Conservé pour compatibilité / scripts éventuels — ne pas réintroduire pour guichet, online ou courrier.
 */
export async function createMovementFromPayment(payment: {
  id: string;
  companyId: string;
  agencyId: string;
  amount: number;
  currency: string;
  channel: "guichet" | "online" | "courrier";
  validatedBy?: string;
}): Promise<void> {
  const amount = Number(payment.amount);
  if (amount <= 0) return;
  const existing = await findMovementByReference(payment.companyId, payment.id);
  if (existing) return;

  const { agencyCashAccountId } = await import("./types");
  const { listAccounts } = await import("./financialAccounts");

  let toAccountId: string;
  if (payment.channel === "guichet" || payment.channel === "courrier") {
    toAccountId = agencyCashAccountId(payment.agencyId);
  } else {
    const accounts = await listAccounts(payment.companyId, {
      accountType: "company_mobile_money",
    });
    if (accounts.length === 0) {
      console.warn("[createMovementFromPayment] Aucun compte company_mobile_money, mouvement non créé.");
      return;
    }
    toAccountId = accounts[0].id;
  }

  await recordMovement({
    companyId: payment.companyId,
    fromAccountId: null,
    toAccountId,
    amount,
    currency: payment.currency ?? "XOF",
    movementType: payment.channel === "online" ? "revenue_online" : "revenue_cash",
    referenceType: "payment",
    referenceId: payment.id,
    agencyId: payment.agencyId,
    performedBy: payment.validatedBy ?? "system",
    sourceType: payment.channel,
  });
}
