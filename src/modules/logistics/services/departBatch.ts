/**
 * Teliya Logistics Engine — Depart batch: OPEN → DEPARTED, shipments ASSIGNED → IN_TRANSIT.
 * Uses runTransaction, validates transitions, appends DEPARTED events. No UI. Isolated.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, batchRef, eventsRef } from "../domain/firestorePaths";

export type DepartBatchParams = {
  companyId: string;
  batchId: string;
  performedBy: string;
  agencyId: string;
};

export async function departBatch(params: DepartBatchParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const bRef = batchRef(db, params.companyId, params.batchId);
    const batchSnap = await tx.get(bRef);
    if (!batchSnap.exists()) throw new Error("Lot introuvable.");

    const batch = batchSnap.data() as { status: string; shipmentIds: string[] };
    if (batch.status !== "OPEN") throw new Error("Le lot doit être OPEN pour partir.");

    for (const sid of batch.shipmentIds) {
      const sRef = shipmentRef(db, params.companyId, sid);
      const shipSnap = await tx.get(sRef);
      if (!shipSnap.exists()) throw new Error(`Envoi introuvable: ${sid}.`);
      const shipment = shipSnap.data() as Shipment;
      if (shipment.currentStatus !== "ASSIGNED")
        throw new Error(`Envoi ${sid} doit être ASSIGNED (actuel: ${shipment.currentStatus}).`);
      if (!canShipmentTransition("ASSIGNED", "IN_TRANSIT"))
        throw new Error("Transition ASSIGNED → IN_TRANSIT non autorisée.");

      tx.update(sRef, {
        currentStatus: "IN_TRANSIT",
        currentAgencyId: params.agencyId,
      });

      const eventsCol = eventsRef(db, params.companyId);
      const eventDoc = doc(eventsCol);
      const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
        shipmentId: sid,
        eventType: "DEPARTED",
        agencyId: params.agencyId,
        performedBy: params.performedBy,
        performedAt: serverTimestamp(),
      };
      tx.set(eventDoc, event);
    }

    tx.update(bRef, { status: "DEPARTED" });
  });
}
