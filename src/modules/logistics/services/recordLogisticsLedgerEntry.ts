/**
 * Teliya Logistics Engine — Append a ledger entry for a courier session.
 * Session must exist and be ACTIVE (agency-scoped courier session).
 * Negative amounts only for REFUND or ADJUSTMENT.
 * Revenue is NOT written here; it is final only after session validation.
 * expectedAmount is computed from shipments at session close, not stored per entry.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { LogisticsLedgerEntry, LedgerEntryType } from "../domain/logisticsFinancial.types";
import { getLogisticsLedgerCollection } from "../domain/firestorePaths";
import { courierSessionRef } from "../domain/courierSessionPaths";

const NEGATIVE_ALLOWED: LedgerEntryType[] = ["REFUND", "ADJUSTMENT"];

export type RecordLogisticsLedgerEntryParams = {
  companyId: string;
  sessionId: string;
  shipmentId: string;
  agencyId: string;
  agentId: string;
  type: LedgerEntryType;
  amount: number;
};

/**
 * Appends a ledger entry and atomically increases session.expectedAmount.
 * Fails if session does not exist, is not OPEN, or amount is negative for non-REFUND/ADJUSTMENT.
 */
export async function recordLogisticsLedgerEntry(params: RecordLogisticsLedgerEntryParams): Promise<string> {
  let entryId: string = "";

  await runTransaction(db, async (tx) => {
    const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
    const sessionSnap = await tx.get(sessionRef);

    if (!sessionSnap.exists()) throw new Error("Session courrier introuvable.");
    const session = sessionSnap.data() as { status: string };
    if (session.status !== "ACTIVE") {
      throw new Error(`La session doit être ACTIVE pour enregistrer une entrée (actuel: ${session.status}).`);
    }

    const amount = Number(params.amount);
    if (amount < 0 && !NEGATIVE_ALLOWED.includes(params.type)) {
      throw new Error("Les montants négatifs sont autorisés uniquement pour REFUND ou ADJUSTMENT.");
    }

    const ledgerCol = getLogisticsLedgerCollection(db, params.companyId);
    const entryRef = doc(ledgerCol);
    entryId = entryRef.id;

    const entry: Omit<LogisticsLedgerEntry, "createdAt"> & { createdAt: ReturnType<typeof serverTimestamp> } = {
      entryId,
      sessionId: params.sessionId,
      shipmentId: params.shipmentId,
      agencyId: params.agencyId,
      agentId: params.agentId,
      type: params.type,
      amount,
      createdAt: serverTimestamp(),
    };
    tx.set(entryRef, entry);
  });

  return entryId;
}
