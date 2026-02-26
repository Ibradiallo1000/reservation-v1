/**
 * Phase 3: ChefAgence marks batch CLOSED. Batch remains DEPARTED until this.
 */

import { runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { agencyBatchRef } from "../../domain/firestorePaths";

export type CloseCourierBatchParams = {
  companyId: string;
  originAgencyId: string;
  batchId: string;
  userRole: string;
};

const ALLOWED_CLOSE_ROLES = ["chefAgence", "admin_compagnie"];

export async function closeCourierBatch(params: CloseCourierBatchParams): Promise<void> {
  if (!ALLOWED_CLOSE_ROLES.includes(params.userRole)) throw new Error("Unauthorized action.");
  await runTransaction(db, async (tx) => {
    const bRef = agencyBatchRef(db, params.companyId, params.originAgencyId, params.batchId);
    const batchSnap = await tx.get(bRef);
    if (!batchSnap.exists()) throw new Error("Lot introuvable.");
    const batch = batchSnap.data() as { status: string };
    if (batch.status !== "DEPARTED") throw new Error("Seul un lot DEPARTED peut être clôturé.");
    tx.update(bRef, { status: "CLOSED", closedAt: serverTimestamp() });
  });
}
