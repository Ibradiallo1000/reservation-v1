/**
 * Service de gestion de caisse TELIYA.
 * cashTransactions = encaissements (vente billet → caisse locale).
 * cashClosures = clôtures journalières (expectedAmount, declaredAmount, difference).
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  CASH_TRANSACTIONS_COLLECTION,
  CASH_CLOSURES_COLLECTION,
  CASH_REFUNDS_COLLECTION,
  CASH_TRANSFERS_COLLECTION,
  CASH_TRANSACTION_STATUS,
  type CashTransactionDocWithId,
  type CashClosureDocWithId,
  type CashRefundDocWithId,
  type CashTransferDocWithId,
  type LocationType,
  type CashPaymentMethod,
  type CashTransferMethod,
} from "./cashTypes";
import { updateDoc } from "firebase/firestore";

function cashTransactionsRef(companyId: string) {
  return collection(db, "companies", companyId, CASH_TRANSACTIONS_COLLECTION);
}

function cashClosuresRef(companyId: string) {
  return collection(db, "companies", companyId, CASH_CLOSURES_COLLECTION);
}

function cashRefundsRef(companyId: string) {
  return collection(db, "companies", companyId, CASH_REFUNDS_COLLECTION);
}

function cashTransfersRef(companyId: string) {
  return collection(db, "companies", companyId, CASH_TRANSFERS_COLLECTION);
}

export interface CreateCashTransactionParams {
  companyId: string;
  reservationId: string;
  tripInstanceId?: string | null;
  amount: number;
  currency?: string;
  paymentMethod: CashPaymentMethod | string;
  locationType: LocationType | string;
  locationId: string;
  routeId?: string | null;
  createdBy: string;
  /** Date du jour (YYYY-MM-DD). Si omis, utilise aujourd'hui. */
  date?: string;
}

/**
 * Crée une entrée de caisse (chaque réservation confirmée génère une cashTransaction).
 */
export async function createCashTransaction(params: CreateCashTransactionParams): Promise<string> {
  const date = params.date ?? new Date().toISOString().split("T")[0];
  const ref = cashTransactionsRef(params.companyId);
  const docRef = await addDoc(ref, {
    reservationId: params.reservationId,
    tripInstanceId: params.tripInstanceId ?? null,
    amount: Number(params.amount) || 0,
    currency: params.currency ?? "XOF",
    paymentMethod: params.paymentMethod ?? "cash",
    locationType: params.locationType,
    locationId: params.locationId,
    routeId: params.routeId ?? null,
    createdBy: params.createdBy,
    date,
    status: CASH_TRANSACTION_STATUS.PAID,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Marque une cashTransaction comme remboursée (lors d'un remboursement).
 */
export async function markCashTransactionRefunded(
  companyId: string,
  transactionId: string
): Promise<void> {
  const ref = doc(db, "companies", companyId, CASH_TRANSACTIONS_COLLECTION, transactionId);
  await updateDoc(ref, { status: CASH_TRANSACTION_STATUS.REFUNDED });
}

/**
 * Liste les transactions de caisse pour un point de vente (agence ou escale) et une date.
 */
export async function getCashTransactionsByLocation(
  companyId: string,
  locationId: string,
  date: string
): Promise<CashTransactionDocWithId[]> {
  const ref = cashTransactionsRef(companyId);
  const q = query(
    ref,
    where("locationId", "==", locationId),
    where("date", "==", date),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransactionDocWithId));
}

/**
 * Montant total encaissé (non remboursé) pour un point de vente sur une date.
 * Ne compte que les transactions avec status !== 'refunded'.
 */
export async function getCashTotalByLocation(
  companyId: string,
  locationId: string,
  date: string
): Promise<number> {
  const list = await getCashTransactionsByLocation(companyId, locationId, date);
  return list.reduce((sum, t) => {
    if ((t as { status?: string }).status === CASH_TRANSACTION_STATUS.REFUNDED) return sum;
    return sum + (Number(t.amount) || 0);
  }, 0);
}

/**
 * Crée une clôture de caisse journalière.
 */
export async function createCashClosure(
  companyId: string,
  params: {
    locationType: LocationType | string;
    locationId: string;
    date: string;
    expectedAmount: number;
    declaredAmount: number;
    createdBy: string;
  }
): Promise<string> {
  const difference = Number(params.declaredAmount) - Number(params.expectedAmount);
  const ref = cashClosuresRef(companyId);
  const docRef = await addDoc(ref, {
    locationType: params.locationType,
    locationId: params.locationId,
    date: params.date,
    expectedAmount: Number(params.expectedAmount) || 0,
    declaredAmount: Number(params.declaredAmount) || 0,
    difference,
    createdBy: params.createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Dernière clôture pour un point de vente (toutes dates).
 */
export async function getLastClosureByLocation(
  companyId: string,
  locationId: string
): Promise<CashClosureDocWithId | null> {
  const ref = cashClosuresRef(companyId);
  const q = query(
    ref,
    where("locationId", "==", locationId),
    orderBy("createdAt", "desc"),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CashClosureDocWithId;
}

/**
 * Clôtures d'une date pour la compagnie (tous points de vente).
 */
export async function getClosuresByDate(
  companyId: string,
  date: string
): Promise<CashClosureDocWithId[]> {
  const ref = cashClosuresRef(companyId);
  const q = query(ref, where("date", "==", date), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashClosureDocWithId));
}

/**
 * Toutes les transactions d'une date pour la compagnie (tous points de vente).
 */
export async function getCashTransactionsByDate(
  companyId: string,
  date: string
): Promise<CashTransactionDocWithId[]> {
  const ref = cashTransactionsRef(companyId);
  const q = query(ref, where("date", "==", date), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransactionDocWithId));
}

// ─────────────── Cash refunds ───────────────

export interface CreateCashRefundParams {
  companyId: string;
  reservationId: string;
  amount: number;
  locationType: LocationType | string;
  locationId: string;
  createdBy: string;
  reason?: string | null;
  date?: string;
}

/**
 * Crée un remboursement (annulation avec remboursement).
 * Optionnel : passer cashTransactionId pour marquer la transaction en refunded.
 */
export async function createCashRefund(params: CreateCashRefundParams): Promise<string> {
  const date = params.date ?? new Date().toISOString().split("T")[0];
  const ref = cashRefundsRef(params.companyId);
  const docRef = await addDoc(ref, {
    reservationId: params.reservationId,
    amount: Number(params.amount) || 0,
    locationType: params.locationType,
    locationId: params.locationId,
    createdBy: params.createdBy,
    reason: params.reason ?? null,
    date,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCashRefundsByLocation(
  companyId: string,
  locationId: string,
  date: string
): Promise<CashRefundDocWithId[]> {
  const ref = cashRefundsRef(companyId);
  const q = query(
    ref,
    where("locationId", "==", locationId),
    where("date", "==", date),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashRefundDocWithId));
}

export async function getCashRefundsByDate(
  companyId: string,
  date: string
): Promise<CashRefundDocWithId[]> {
  const ref = cashRefundsRef(companyId);
  const q = query(ref, where("date", "==", date), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashRefundDocWithId));
}

export async function getCashRefundTotalByLocation(
  companyId: string,
  locationId: string,
  date: string
): Promise<number> {
  const list = await getCashRefundsByLocation(companyId, locationId, date);
  return list.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
}

// ─────────────── Cash transfers ───────────────

export interface CreateCashTransferParams {
  companyId: string;
  locationType: LocationType | string;
  locationId: string;
  amount: number;
  transferMethod: CashTransferMethod | string;
  createdBy: string;
  date?: string;
}

/**
 * Enregistre un transfert d'argent du point de vente vers la compagnie.
 */
export async function createCashTransfer(params: CreateCashTransferParams): Promise<string> {
  const date = params.date ?? new Date().toISOString().split("T")[0];
  const ref = cashTransfersRef(params.companyId);
  const docRef = await addDoc(ref, {
    locationType: params.locationType,
    locationId: params.locationId,
    amount: Number(params.amount) || 0,
    transferMethod: params.transferMethod ?? "cash",
    createdBy: params.createdBy,
    date,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getCashTransfersByLocation(
  companyId: string,
  locationId: string,
  date: string
): Promise<CashTransferDocWithId[]> {
  const ref = cashTransfersRef(companyId);
  const q = query(
    ref,
    where("locationId", "==", locationId),
    where("date", "==", date),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransferDocWithId));
}

export async function getCashTransfersByDate(
  companyId: string,
  date: string
): Promise<CashTransferDocWithId[]> {
  const ref = cashTransfersRef(companyId);
  const q = query(ref, where("date", "==", date), orderBy("createdAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransferDocWithId));
}

export async function getCashTransferTotalByLocation(
  companyId: string,
  locationId: string,
  date: string
): Promise<number> {
  const list = await getCashTransfersByLocation(companyId, locationId, date);
  return list.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}
