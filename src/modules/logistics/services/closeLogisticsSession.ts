/**
 * Teliya Logistics Engine — Close a logistics session (OPEN → CLOSED).
 * Sets countedAmount, difference, closedAt, closedBy. Clears agent open-session guard.
 * Uses runTransaction. No UI. Isolated.
 */

import { runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { LogisticsSession } from "../domain/logisticsFinancial.types";
import { getLogisticsSessionRef, agentOpenSessionRef } from "../domain/firestorePaths";

export type CloseLogisticsSessionParams = {
  companyId: string;
  sessionId: string;
  countedAmount: number;
  closedBy: string;
};

/**
 * Closes the session: status CLOSED, countedAmount, difference = countedAmount - expectedAmount.
 * Fails if session is not OPEN.
 */
export async function closeLogisticsSession(params: CloseLogisticsSessionParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sessionRef = getLogisticsSessionRef(db, params.companyId, params.sessionId);
    const sessionSnap = await tx.get(sessionRef);

    if (!sessionSnap.exists()) throw new Error("Session logistique introuvable.");
    const session = sessionSnap.data() as LogisticsSession;
    if (session.status !== "OPEN") {
      throw new Error(`La session doit être OPEN pour être fermée (actuel: ${session.status}).`);
    }

    const countedAmount = Number(params.countedAmount);
    const expectedAmount = Number(session.expectedAmount ?? 0);
    const difference = countedAmount - expectedAmount;

    tx.update(sessionRef, {
      status: "CLOSED",
      countedAmount,
      difference,
      closedAt: serverTimestamp(),
      closedBy: params.closedBy,
    });

    const agentRef = agentOpenSessionRef(db, params.companyId, session.openedBy);
    tx.delete(agentRef);
  });
}
