/**
 * Courier session service — aligned with Ticket (Guichet) shift architecture.
 * Lifecycle: PENDING (agent) → ACTIVE (accountant) → CLOSED (agent) → VALIDATED (accountant).
 * expectedAmount is computed from shipments at close, not stored per ledger entry.
 */

import {
  doc,
  setDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { CourierSession, CourierSessionStatus } from "../domain/courierSession.types";
import { courierSessionsRef, courierSessionRef } from "../domain/courierSessionPaths";
import { shipmentsRef } from "../domain/firestorePaths";

const OPEN_STATUSES: CourierSessionStatus[] = ["PENDING", "ACTIVE"];

/** Returns existing open session id for this agent, or null. */
export async function getOpenCourierSessionId(
  companyId: string,
  agencyId: string,
  agentId: string
): Promise<string | null> {
  const col = courierSessionsRef(db, companyId, agencyId);
  const q = query(col, where("agentId", "==", agentId), limit(20));
  const snap = await getDocs(q);
  const open = snap.docs
    .filter((d) => OPEN_STATUSES.includes((d.data() as CourierSession).status))
    .sort((a, b) => {
      const aT = (a.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const bT = (b.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      return bT - aT;
    });
  return open.length > 0 ? open[0].id : null;
}

/**
 * Agent creates a session → PENDING.
 * Fails if agent already has an open (PENDING or ACTIVE) session.
 */
export async function createCourierSession(params: {
  companyId: string;
  agencyId: string;
  agentId: string;
  agentCode: string;
}): Promise<string> {
  const existing = await getOpenCourierSessionId(params.companyId, params.agencyId, params.agentId);
  if (existing) return existing;

  const col = courierSessionsRef(db, params.companyId, params.agencyId);
  const ref = doc(col);
  const sessionId = ref.id;
  await setDoc(ref, {
    sessionId,
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: params.agentId,
    agentCode: params.agentCode,
    status: "PENDING",
    openedAt: null,
    closedAt: null,
    validatedAt: null,
    expectedAmount: 0,
    validatedAmount: null,
    difference: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return sessionId;
}

/**
 * Accountant activates session → ACTIVE.
 * Only PENDING can be activated.
 */
export async function activateCourierSession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  activatedBy: { id: string; name?: string | null };
}): Promise<void> {
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error("Session courrier introuvable.");
  const data = snap.data() as CourierSession;
  if (data.status !== "PENDING") {
    throw new Error("Seule une session en attente peut être activée.");
  }

  await runTransaction(db, async (tx) => {
    const s = await tx.get(sessionRef);
    if (!s.exists()) throw new Error("Session courrier introuvable.");
    if ((s.data() as CourierSession).status !== "PENDING") {
      throw new Error("Seule une session en attente peut être activée.");
    }
    const now = serverTimestamp();
    tx.update(sessionRef, {
      status: "ACTIVE",
      openedAt: now,
      activatedBy: {
        id: params.activatedBy.id,
        name: params.activatedBy.name ?? null,
      },
      updatedAt: now,
    });
  });
}

/**
 * Agent closes session → CLOSED.
 * expectedAmount is computed from shipments linked to sessionId (transportFee + insuranceAmount per shipment).
 */
export async function closeCourierSession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
}): Promise<{ expectedAmount: number }> {
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const shipCol = shipmentsRef(db, params.companyId);
  const shipQuery = query(shipCol, where("sessionId", "==", params.sessionId));
  const shipSnap = await getDocs(shipQuery);
  let expectedAmount = 0;
  shipSnap.docs.forEach((d) => {
    const s = d.data() as { transportFee?: number; insuranceAmount?: number };
    expectedAmount += Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
  });

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists()) throw new Error("Session courrier introuvable.");
    const data = sSnap.data() as CourierSession;
    if (data.status !== "ACTIVE") {
      throw new Error("La session doit être ACTIVE pour être clôturée.");
    }
    tx.update(sessionRef, {
      status: "CLOSED",
      closedAt: serverTimestamp(),
      expectedAmount,
      updatedAt: serverTimestamp(),
    });
  });

  return { expectedAmount };
}

/**
 * Accountant validates session (with counted amount) → VALIDATED.
 * Sets validatedAmount, difference = validatedAmount - expectedAmount.
 */
export async function validateCourierSession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  validatedAmount: number;
  validatedBy: { id: string; name?: string | null };
}): Promise<{ difference: number }> {
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error("Session courrier introuvable.");
  const data = snap.data() as CourierSession;
  if (data.status !== "CLOSED") {
    throw new Error("La session doit être CLOSED pour être validée.");
  }
  const expectedAmount = Number(data.expectedAmount ?? 0);
  const difference = params.validatedAmount - expectedAmount;

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists()) throw new Error("Session courrier introuvable.");
    if ((sSnap.data() as CourierSession).status !== "CLOSED") {
      throw new Error("La session doit être CLOSED pour être validée.");
    }
    tx.update(sessionRef, {
      status: "VALIDATED",
      validatedAt: serverTimestamp(),
      validatedAmount: params.validatedAmount,
      difference,
      validatedBy: {
        id: params.validatedBy.id,
        name: params.validatedBy.name ?? null,
      },
      updatedAt: serverTimestamp(),
    });
  });

  return { difference };
}
