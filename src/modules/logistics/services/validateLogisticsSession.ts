/**
 * Teliya Logistics Engine — Validate a closed logistics session (CLOSED → VALIDATED).
 * No further ledger entries allowed after validation.
 * Uses runTransaction. No UI. Isolated.
 */

import { runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { LogisticsSession } from "../domain/logisticsFinancial.types";
import { getLogisticsSessionRef } from "../domain/firestorePaths";

export type ValidateLogisticsSessionParams = {
  companyId: string;
  sessionId: string;
  validatedBy: string;
};

/**
 * Validates the session: status VALIDATED, validatedBy, validatedAt.
 * Fails if session is not CLOSED.
 */
export async function validateLogisticsSession(params: ValidateLogisticsSessionParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sessionRef = getLogisticsSessionRef(db, params.companyId, params.sessionId);
    const sessionSnap = await tx.get(sessionRef);

    if (!sessionSnap.exists()) throw new Error("Session logistique introuvable.");
    const session = sessionSnap.data() as LogisticsSession;
    if (session.status !== "CLOSED") {
      throw new Error(`La session doit être CLOSED pour être validée (actuel: ${session.status}).`);
    }

    tx.update(sessionRef, {
      status: "VALIDATED",
      validatedBy: params.validatedBy,
      validatedAt: serverTimestamp(),
    });
  });
}
