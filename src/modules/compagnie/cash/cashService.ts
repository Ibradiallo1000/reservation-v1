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
import { getTodayBamako, normalizeDateToYYYYMMDD } from "@/shared/date/dateUtilsTz";
import { setDoc } from "firebase/firestore";

export type { CashTransactionDocWithId } from "./cashTypes";

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
  /** Session guichet/courrier qui a encaissé (pour traçabilité positions). */
  sessionId?: string | null;
  /** Source métier (audit-proof). */
  sourceType?: "guichet" | "online" | "transfer";
  /** Session source si applicable (guichet/courrier/virtualSession). */
  sourceSessionId?: string | null;
  tripInstanceId?: string | null;
  amount: number;
  currency?: string;
  paymentMethod: CashPaymentMethod | string;
  locationType: LocationType | string;
  locationId: string;
  routeId?: string | null;
  createdBy: string;
  /** Date réelle d'encaissement (YYYY-MM-DD). Source de vérité pour les encaissements. Si omis, utilise aujourd'hui (Bamako). */
  paidAt?: string;
  /** @deprecated Utiliser paidAt. Conservé pour rétrocompat. */
  date?: string;
  /** Nombre de places (billets) — pour totaux session depuis caisse. */
  seats?: number;
  /** Libellé trajet (ex. "Bamako→Gao") pour rapports. */
  routeLabel?: string | null;
}

function virtualSessionIdForOnline(agencyId: string, paidAt: string): string {
  return `virtual_online_${agencyId}_${paidAt}`;
}

async function ensureVirtualSession(companyId: string, sessionId: string, payload: Record<string, unknown>) {
  const ref = doc(db, "companies", companyId, "virtualSessions", sessionId);
  await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Crée une entrée de caisse (chaque réservation confirmée génère une cashTransaction).
 * paidAt = date réelle d'encaissement (vente). Ne pas utiliser la date du trajet.
 */
export async function createCashTransaction(params: CreateCashTransactionParams): Promise<string> {
  const paidAtRaw = params.paidAt ?? params.date ?? getTodayBamako();
  const paidAt = normalizeDateToYYYYMMDD(paidAtRaw);
  const sourceType = params.sourceType ?? "guichet";

  // SessionId obligatoire pour guichet (audit-proof). Online -> session virtuelle.
  let sessionId = params.sessionId ?? params.sourceSessionId ?? null;
  if (sourceType === "guichet") {
    if (!sessionId || String(sessionId).trim().length === 0) {
      throw new Error("cashTransaction: sessionId obligatoire pour sourceType=guichet");
    }
  }
  if (sourceType === "online") {
    // session virtuelle par agence et jour (paidAt)
    sessionId = sessionId ?? virtualSessionIdForOnline(params.locationId, paidAt);
    await ensureVirtualSession(params.companyId, sessionId, {
      companyId: params.companyId,
      agencyId: params.locationId,
      paidAt,
      sourceType: "online",
    });
  }

  const ref = cashTransactionsRef(params.companyId);
  const docRef = await addDoc(ref, {
    reservationId: params.reservationId,
    sessionId,
    sourceType,
    sourceSessionId: sessionId,
    tripInstanceId: params.tripInstanceId ?? null,
    amount: Number(params.amount) || 0,
    currency: params.currency ?? "XOF",
    paymentMethod: params.paymentMethod ?? "cash",
    locationType: params.locationType,
    locationId: params.locationId,
    routeId: params.routeId ?? null,
    createdBy: params.createdBy,
    date: paidAt,
    paidAt,
    status: CASH_TRANSACTION_STATUS.PAID,
    seats: params.seats ?? null,
    routeLabel: params.routeLabel ?? null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Retourne les cashTransactions d'une session guichet (source de vérité pour totaux session).
 * Utilisé pour closeSession et rapports.
 */
export async function getCashTransactionsBySessionId(
  companyId: string,
  sessionId: string
): Promise<CashTransactionDocWithId[]> {
  const ref = cashTransactionsRef(companyId);
  const q = query(
    ref,
    where("sourceSessionId", "==", sessionId),
    where("status", "==", CASH_TRANSACTION_STATUS.PAID)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransactionDocWithId));
}

/**
 * Marque une cashTransaction comme remboursée (lors d'un remboursement ou annulation).
 * À appeler systématiquement lorsqu'une réservation est annulée et possède un cashTransactionId.
 */
export async function markCashTransactionRefunded(
  companyId: string,
  transactionId: string
): Promise<void> {
  const ref = doc(db, "companies", companyId, CASH_TRANSACTIONS_COLLECTION, transactionId);
  await updateDoc(ref, {
    status: CASH_TRANSACTION_STATUS.REFUNDED,
    refundedAt: serverTimestamp(),
  });
}

/**
 * Marque une cashTransaction comme orpheline (réservation absente ou invalide).
 * Les transactions orphelines ne sont pas incluses dans les encaissements principaux.
 */
export async function markCashTransactionOrphan(
  companyId: string,
  transactionId: string
): Promise<void> {
  const ref = doc(db, "companies", companyId, CASH_TRANSACTIONS_COLLECTION, transactionId);
  await updateDoc(ref, { status: CASH_TRANSACTION_STATUS.ORPHAN });
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

/**
 * Transactions de caisse sur une plage de dates (champ "date" — rétrocompat).
 * Pour les encaissements par période, privilégier getCashTransactionsByPaidAtRange.
 * Requiert index : cashTransactions (date ASC).
 */
export async function getCashTransactionsByDateRange(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<CashTransactionDocWithId[]> {
  const ref = cashTransactionsRef(companyId);
  const q = query(
    ref,
    where("date", ">=", dateFrom),
    where("date", "<=", dateTo),
    orderBy("date", "asc"),
    limit(5000)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransactionDocWithId));
}

/**
 * Transactions de caisse par date réelle d'encaissement (paidAt).
 * Source de vérité pour les encaissements par période. Les documents sans paidAt
 * (données anciennes) ne sont pas retournés — exécuter la migration de backfill si besoin.
 * Requiert index : cashTransactions (paidAt ASC).
 * paidAt en base doit être au format "YYYY-MM-DD" strict pour matcher la plage.
 *
 * Recommandation future : migrer paidAt vers Firestore Timestamp pour requêtes et indexation
 * cohérentes (comparaisons de dates sans ambiguïté de timezone).
 */
export async function getCashTransactionsByPaidAtRange(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<CashTransactionDocWithId[]> {
  const from = normalizeDateToYYYYMMDD(dateFrom);
  const to = normalizeDateToYYYYMMDD(dateTo);
  const ref = cashTransactionsRef(companyId);

  // Firestore ne gère pas de manière fiable les ranges (>= / <=) sur des chaînes de date.
  // Pour un seul jour (dateFrom === dateTo), utiliser l'égalité pour garantir les résultats.
  const q =
    from === to
      ? query(ref, where("paidAt", "==", from), limit(5000))
      : query(
          ref,
          where("paidAt", ">=", from),
          where("paidAt", "<=", to),
          orderBy("paidAt", "asc"),
          limit(5000)
        );

  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashTransactionDocWithId));
  const first = list[0] as (CashTransactionDocWithId & { paidAt?: string }) | undefined;
  // eslint-disable-next-line no-console
  console.log("[TELIYA cash] getCashTransactionsByPaidAtRange", {
    dateFrom: from,
    dateTo: to,
    requestedDateFrom: dateFrom,
    requestedDateTo: dateTo,
    resultsCount: list.length,
    samplePaidAt: first?.paidAt ?? first?.date,
    sample: first
      ? { id: first.id, paidAt: (first as any).paidAt, date: (first as any).date, amount: (first as any).amount }
      : null,
  });
  return list;
}

/**
 * Debug : récupère toutes les cashTransactions sans filtre (pour vérifier que les données existent).
 * À appeler temporairement depuis la console ou un bouton debug.
 */
export async function getCashTransactionsUnfilteredForDebug(
  companyId: string
): Promise<{ count: number; totalAmount: number; paidAtSamples: string[] }> {
  const ref = cashTransactionsRef(companyId);
  const snap = await getDocs(ref);
  let totalAmount = 0;
  const paidAtSamples: string[] = [];
  snap.docs.forEach((d) => {
    const data = d.data() as { amount?: number; paidAt?: string; date?: string };
    totalAmount += Number(data.amount ?? 0) || 0;
    const pa = (data.paidAt ?? data.date ?? "").toString().trim();
    if (pa && paidAtSamples.length < 20 && !paidAtSamples.includes(pa)) paidAtSamples.push(pa);
  });
  // eslint-disable-next-line no-console
  console.log("[TELIYA cash] getCashTransactionsUnfilteredForDebug", {
    companyId,
    documentCount: snap.docs.length,
    totalAmount,
    paidAtSamples,
  });
  return { count: snap.docs.length, totalAmount, paidAtSamples };
}

/**
 * Debug : requête avec filtre paidAt exact (pour tester si le souci vient du range >= <=).
 */
export async function getCashTransactionsByPaidAtExact(
  companyId: string,
  dateStr: string
): Promise<CashTransactionDocWithId[]> {
  const date = normalizeDateToYYYYMMDD(dateStr);
  const ref = cashTransactionsRef(companyId);
  const q = query(ref, where("paidAt", "==", date), limit(500));
  const snap = await getDocs(q).catch(() => ({ docs: [] as any }));
  const list = snap.docs.map((d: any) => ({ id: d.id, ...d.data() } as CashTransactionDocWithId));
  // eslint-disable-next-line no-console
  console.log("[TELIYA cash] getCashTransactionsByPaidAtExact", {
    dateStr: date,
    resultsCount: list.length,
    sample: list[0]
      ? {
          id: (list[0] as any).id,
          paidAt: (list[0] as any).paidAt,
          amount: (list[0] as any).amount,
        }
      : null,
  });
  return list;
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
