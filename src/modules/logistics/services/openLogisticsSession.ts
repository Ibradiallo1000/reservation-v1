/**
 * Teliya Logistics Engine — Open a logistics financial session.
 * One OPEN session per agent. Uses runTransaction. No UI. Isolated.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { LogisticsSession } from "../domain/logisticsFinancial.types";
import {
  getLogisticsSessionRef,
  sessionsRef,
  agentOpenSessionRef,
} from "../domain/firestorePaths";

export type OpenLogisticsSessionParams = {
  companyId: string;
  agencyId: string;
  openedBy: string;
};

/**
 * Opens a new logistics session. Fails if the agent already has an OPEN session.
 * Returns the new sessionId.
 */
export async function openLogisticsSession(params: OpenLogisticsSessionParams): Promise<string> {
  let sessionId: string = "";

  await runTransaction(db, async (tx) => {
    const agentRef = agentOpenSessionRef(db, params.companyId, params.openedBy);
    const agentSnap = await tx.get(agentRef);

    if (agentSnap.exists()) {
      const existingSessionId = (agentSnap.data() as { sessionId: string }).sessionId;
      const sessionRef = getLogisticsSessionRef(db, params.companyId, existingSessionId);
      const sessionSnap = await tx.get(sessionRef);
      if (sessionSnap.exists()) {
        const session = sessionSnap.data() as LogisticsSession;
        if (session.status === "OPEN") {
          throw new Error("Cet agent a déjà une session logistique ouverte.");
        }
      }
    }

    const sessionsCol = sessionsRef(db, params.companyId);
    const newSessionRef = doc(sessionsCol);
    sessionId = newSessionRef.id;

    const session: Omit<LogisticsSession, "openedAt"> & { openedAt: ReturnType<typeof serverTimestamp> } = {
      sessionId,
      agencyId: params.agencyId,
      openedBy: params.openedBy,
      openedAt: serverTimestamp(),
      status: "OPEN",
      expectedAmount: 0,
    };

    tx.set(newSessionRef, session);
    tx.set(agentRef, { sessionId });
  });

  return sessionId;
}
