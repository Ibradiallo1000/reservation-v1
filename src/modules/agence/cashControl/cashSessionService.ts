/**
 * Agency cash control — open/close/validate cash sessions, update expected balances from sales.
 * Supports payment method separation (expectedCash, expectedMobileMoney, expectedBank) and backward compat (expectedBalance).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  runTransaction,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  CASH_SESSION_COLLECTION,
  CASH_SESSION_STATUS,
  CASH_SESSION_TYPE,
  getTotalExpected,
  getTotalCounted,
  type CashSessionDoc,
  type CashSessionDocWithId,
  type CashSessionStatus,
  type CashSessionType,
  type CashPaymentMethod,
} from "./cashSessionTypes";
// Cash sessions are reconciliation-only. Revenue and treasury movements come ONLY from
// operational session validation (validateSessionByAccountant, validateCourierSession).
function cashSessionsRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, CASH_SESSION_COLLECTION);
}

function cashSessionRef(companyId: string, agencyId: string, sessionId: string) {
  return doc(db, "companies", companyId, "agences", agencyId, CASH_SESSION_COLLECTION, sessionId);
}

/** Open a new cash session. Only one OPEN session per agentId+type per agency. */
export async function openCashSession(
  companyId: string,
  agencyId: string,
  agentId: string,
  type: CashSessionType,
  openingBalance: number
): Promise<string> {
  const existing = await getOpenCashSession(companyId, agencyId, agentId, type);
  if (existing) throw new Error("Une session de caisse est déjà ouverte pour ce type.");
  const ref = doc(cashSessionsRef(companyId, agencyId));
  const now = Timestamp.now();
  const open = Number(openingBalance) || 0;
  const data: CashSessionDoc = {
    agentId,
    type,
    openedAt: now,
    openingBalance: open,
    expectedBalance: open,
    expectedCash: open,
    expectedMobileMoney: 0,
    expectedBank: 0,
    status: CASH_SESSION_STATUS.OPEN,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return ref.id;
}

/** Get the open cash session for an agent and type, if any. */
export async function getOpenCashSession(
  companyId: string,
  agencyId: string,
  agentId: string,
  type: CashSessionType
): Promise<CashSessionDocWithId | null> {
  const q = query(
    cashSessionsRef(companyId, agencyId),
    where("agentId", "==", agentId),
    where("type", "==", type),
    where("status", "==", CASH_SESSION_STATUS.OPEN),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() } as CashSessionDocWithId;
}

/** Add amount to the open session's expected balance for the given payment method. */
export async function addToExpectedBalance(
  companyId: string,
  agencyId: string,
  agentId: string,
  type: CashSessionType,
  amount: number,
  paymentMethod: CashPaymentMethod = "cash"
): Promise<void> {
  if (amount <= 0) return;
  const session = await getOpenCashSession(companyId, agencyId, agentId, type);
  if (!session) return;
  const ref = cashSessionRef(companyId, agencyId, session.id);
  const updates: Record<string, unknown> = {
    expectedBalance: increment(amount),
    updatedAt: serverTimestamp(),
  };
  if (paymentMethod === "cash") updates.expectedCash = increment(amount);
  else if (paymentMethod === "mobile_money") updates.expectedMobileMoney = increment(amount);
  else if (paymentMethod === "bank") updates.expectedBank = increment(amount);
  await updateDoc(ref, updates);
}

/** Close session: agent enters counted amounts; discrepancy = totalCounted - totalExpected. Only the agent who opened can close. */
export async function closeCashSession(
  companyId: string,
  agencyId: string,
  sessionId: string,
  countedBalance: number,
  userId: string,
  options?: { countedCash?: number; countedMobileMoney?: number; countedBank?: number }
): Promise<void> {
  const ref = cashSessionRef(companyId, agencyId, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Session introuvable.");
  const data = snap.data() as CashSessionDoc;
  if (data.status !== CASH_SESSION_STATUS.OPEN) throw new Error("Seule une session ouverte peut être clôturée.");
  if (data.agentId !== userId) throw new Error("Seul l'agent qui a ouvert la session peut la clôturer.");
  const totalExpected = getTotalExpected(data);
  const useSplit = options && (options.countedCash != null || options.countedMobileMoney != null || options.countedBank != null);
  const totalCounted = useSplit
    ? (Number(options!.countedCash) || 0) + (Number(options!.countedMobileMoney) || 0) + (Number(options!.countedBank) || 0)
    : Number(countedBalance) ?? 0;
  const discrepancy = totalCounted - totalExpected;
  const now = Timestamp.now();
  const updatePayload: Record<string, unknown> = {
    closedAt: now,
    discrepancy,
    status: CASH_SESSION_STATUS.CLOSED,
    updatedAt: serverTimestamp(),
  };
  if (useSplit) {
    updatePayload.countedCash = options!.countedCash ?? null;
    updatePayload.countedMobileMoney = options!.countedMobileMoney ?? null;
    updatePayload.countedBank = options!.countedBank ?? null;
    updatePayload.countedBalance = totalCounted;
  } else {
    updatePayload.countedBalance = totalCounted;
  }
  await updateDoc(ref, updatePayload);
}

/**
 * Validate session (accountant): set status VALIDATED for reconciliation audit only.
 * Cash sessions are NOT a financial source of truth. No treasury movement, no dailyStats update.
 * Revenue is recorded only when operational sessions are validated (ticket shift or courier session).
 */
export async function validateCashSession(
  companyId: string,
  agencyId: string,
  sessionId: string,
  userId: string,
  userRole: string
): Promise<void> {
  const ref = cashSessionRef(companyId, agencyId, sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Session introuvable.");
    const data = snap.data() as CashSessionDoc;
    if (data.status !== CASH_SESSION_STATUS.CLOSED) {
      throw new Error("Seule une session clôturée peut être validée.");
    }

    tx.update(ref, {
      status: CASH_SESSION_STATUS.VALIDATED,
      validatedAt: Timestamp.now(),
      validatedBy: userId,
      updatedAt: serverTimestamp(),
    });
  });
}

/** Reject session (accountant). */
export async function rejectCashSession(
  companyId: string,
  agencyId: string,
  sessionId: string,
  userId: string,
  rejectionReason?: string
): Promise<void> {
  const ref = cashSessionRef(companyId, agencyId, sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Session introuvable.");
  const data = snap.data() as CashSessionDoc;
  if (data.status !== CASH_SESSION_STATUS.CLOSED) {
    throw new Error("Seule une session clôturée peut être rejetée.");
  }
  await updateDoc(ref, {
    status: "REJECTED" as CashSessionStatus,
    rejectionReason: rejectionReason ?? null,
    validatedBy: userId,
    updatedAt: serverTimestamp(),
  });
}

/** List sessions for an agency (optional filter by status). */
export async function listCashSessions(
  companyId: string,
  agencyId: string,
  options?: { status?: CashSessionStatus; limitCount?: number }
): Promise<CashSessionDocWithId[]> {
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.status) constraints.push(where("status", "==", options.status));
  const q = query(
    cashSessionsRef(companyId, agencyId),
    ...constraints,
    orderBy("openedAt", "desc"),
    limit(options?.limitCount ?? 50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashSessionDocWithId));
}

/** Get a single session by id. */
export async function getCashSession(
  companyId: string,
  agencyId: string,
  sessionId: string
): Promise<CashSessionDocWithId | null> {
  const snap = await getDoc(cashSessionRef(companyId, agencyId, sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CashSessionDocWithId;
}

/** Record a cash session expense: creates expense doc and decrements session expectedCash (and expectedBalance for compat). */
export async function addCashSessionExpense(
  companyId: string,
  agencyId: string,
  sessionId: string,
  params: { amount: number; category: string; description?: string | null; createdBy: string }
): Promise<string> {
  const amount = Number(params.amount) || 0;
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");
  const sessionRef = cashSessionRef(companyId, agencyId, sessionId);
  const expensesRef = collection(db, "companies", companyId, "agences", agencyId, "cashSessionExpenses");
  const expenseRef = doc(expensesRef);
  const now = Timestamp.now();
  await runTransaction(db, async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists()) throw new Error("Session introuvable.");
    const sessionData = sessionSnap.data() as CashSessionDoc;
    if (sessionData.status !== CASH_SESSION_STATUS.OPEN) throw new Error("Seule une session ouverte peut enregistrer une dépense.");
    tx.set(expenseRef, {
      sessionId,
      amount,
      category: params.category || "",
      description: params.description ?? null,
      createdBy: params.createdBy,
      createdAt: now,
    });
    const currentCash = Number(sessionData.expectedCash ?? sessionData.expectedBalance ?? 0);
    const updatePayload: Record<string, unknown> = {
      expectedCash: Math.max(0, currentCash - amount),
      expectedBalance: increment(-amount),
      updatedAt: serverTimestamp(),
    };
    tx.update(sessionRef, updatePayload);
  });
  return expenseRef.id;
}

/** List expenses for a session. */
export async function listCashSessionExpenses(
  companyId: string,
  agencyId: string,
  sessionId: string
): Promise<{ id: string; sessionId: string; amount: number; category: string; description: string | null; createdBy: string; createdAt: unknown }[]> {
  const expensesRef = collection(db, "companies", companyId, "agences", agencyId, "cashSessionExpenses");
  const q = query(
    expensesRef,
    where("sessionId", "==", sessionId),
    orderBy("createdAt", "desc"),
    limit(200)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; sessionId: string; amount: number; category: string; description: string | null; createdBy: string; createdAt: unknown }));
}

/** List closed sessions with non-zero discrepancy across all agencies (for CEO dashboard). */
export async function listClosedCashSessionsWithDiscrepancy(
  companyId: string,
  agencyIds: string[]
): Promise<{ agencyId: string; session: CashSessionDocWithId }[]> {
  const results: { agencyId: string; session: CashSessionDocWithId }[] = [];
  await Promise.all(
    agencyIds.map(async (agencyId) => {
      const list = await listCashSessions(companyId, agencyId, {
        status: CASH_SESSION_STATUS.CLOSED,
        limitCount: 100,
      });
      list.forEach((session) => {
        const d = Number(session.discrepancy ?? 0);
        if (d !== 0) results.push({ agencyId, session });
      });
    })
  );
  return results;
}

