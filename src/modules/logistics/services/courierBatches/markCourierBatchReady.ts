import { runTransaction } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { agencyBatchRef } from "../../domain/firestorePaths";

export type MarkCourierBatchReadyParams = {
  companyId: string;
  originAgencyId: string;
  batchId: string;
};

export async function markCourierBatchReady(params: MarkCourierBatchReadyParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const bRef = agencyBatchRef(db, params.companyId, params.originAgencyId, params.batchId);
    const batchSnap = await tx.get(bRef);
    if (!batchSnap.exists()) throw new Error("Lot introuvable.");
    const batch = batchSnap.data() as { status: string; shipmentIds: string[] };
    if (batch.status !== "DRAFT") throw new Error("Lot doit etre DRAFT.");
    if (!batch.shipmentIds || batch.shipmentIds.length === 0) throw new Error("Cannot mark batch READY without shipments.");
    tx.update(bRef, { status: "READY" });
  });
}
