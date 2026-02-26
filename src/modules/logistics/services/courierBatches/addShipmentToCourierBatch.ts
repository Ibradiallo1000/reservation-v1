import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Shipment } from "../../domain/shipment.types";
import { shipmentRef, agencyBatchRef, eventsRef } from "../../domain/firestorePaths";

export type AddShipmentToCourierBatchParams = {
  companyId: string;
  originAgencyId: string;
  batchId: string;
  shipmentId: string;
  performedBy: string;
};

export async function addShipmentToCourierBatch(params: AddShipmentToCourierBatchParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const bRef = agencyBatchRef(db, params.companyId, params.originAgencyId, params.batchId);
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const batchSnap = await tx.get(bRef);
    const shipSnap = await tx.get(sRef);
    if (!batchSnap.exists()) throw new Error("Batch not found");
    if (!shipSnap.exists()) throw new Error("Shipment not found");
    const batch = batchSnap.data() as { status: string; shipmentIds: string[]; originAgencyId: string };
    const shipment = shipSnap.data() as Shipment;
    if (batch.status !== "DRAFT") throw new Error("Batch must be DRAFT");
    if (shipment.currentStatus !== "CREATED") throw new Error("Shipment must be CREATED");
    if (shipment.originAgencyId !== batch.originAgencyId) throw new Error("Shipment does not belong to this agency.");
    if (shipment.batchId != null && shipment.batchId !== params.batchId) throw new Error("Shipment in another batch");
    if (batch.shipmentIds.includes(params.shipmentId)) throw new Error("Already in batch");
    const nextIds = batch.shipmentIds.concat(params.shipmentId);
    tx.update(bRef, { shipmentIds: nextIds });
    tx.update(sRef, { batchId: params.batchId });
    const evRef = doc(eventsRef(db, params.companyId));
    tx.set(evRef, {
      shipmentId: params.shipmentId,
      eventType: "ASSIGNED_TO_BATCH",
      agencyId: params.originAgencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    });
  });
}
