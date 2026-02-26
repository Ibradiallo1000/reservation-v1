/**
 * Teliya Logistics — Allocate agent courrier code (C001, C002, …).
 * Mirrors Ticket (Guichet) guest code allocation: runTransaction, no race condition.
 * Firestore path: companies/{companyId}/agences/{agencyId}/counters/agentCourrier
 */

import { doc, runTransaction, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const COUNTER_DOC = "agentCourrier";
const PREFIX = "C";
const PAD_LEN = 3;

export async function allocateCourierAgentCode(params: {
  companyId: string;
  agencyId: string;
}): Promise<string> {
  const { companyId, agencyId } = params;
  const counterRef = doc(
    db,
    "companies",
    companyId,
    "agences",
    agencyId,
    "counters",
    COUNTER_DOC
  );

  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const last = snap.exists() ? (snap.data()?.lastSeq ?? 0) : 0;
    const n = last + 1;
    tx.set(
      counterRef,
      { lastSeq: n, updatedAt: Timestamp.now() },
      { merge: true }
    );
    return n;
  });

  return PREFIX + String(nextSeq).padStart(PAD_LEN, "0");
}
