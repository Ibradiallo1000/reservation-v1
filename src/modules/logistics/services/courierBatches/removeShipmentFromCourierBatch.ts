import { runTransaction, deleteField } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { shipmentRef, agencyBatchRef } from "../../domain/firestorePaths";

export type RemoveShipmentFromCourierBatchParams = {
  companyId: string;
  originAgencyId: string;
  batchId: string;
  shipmentId: string;
};

export async function removeShipmentFromCourierBatch(params: RemoveShipmentFromCourierBatchParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const bRef = agencyBatchRef(db, params.companyId, params.originAgencyId, params.batchId);
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const batchSnap = await tx.get(bRef);
    if (!batchSnap.exists()) throw new Error("Batch not found");
    const batch = batchSnap.data() as { status: string; shipmentIds: string[] };
    if (batch.status !== "DRAFT") throw new Error("Batch must be DRAFT");
    if (!batch.shipmentIds.includes(params.shipmentId)) throw new Error("Shipment not in batch");
    tx.update(bRef, { shipmentIds: batch.shipmentIds.filter((id) => id !== params.shipmentId) });
    tx.update(sRef, { batchId: deleteField() });
  });
}
