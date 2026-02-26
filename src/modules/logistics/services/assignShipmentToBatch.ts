/**
 * Teliya Logistics Engine — Assign shipment to batch (STORED → ASSIGNED).
 * Uses runTransaction, validates transition, appends ASSIGNED_TO_BATCH. No UI. Isolated.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, batchRef, eventsRef } from "../domain/firestorePaths";

export type AssignShipmentToBatchParams = {
  companyId: string;
  shipmentId: string;
  batchId: string;
  performedBy: string;
  agencyId: string;
};

export async function assignShipmentToBatch(params: AssignShipmentToBatchParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const bRef = batchRef(db, params.companyId, params.batchId);

    const shipSnap = await tx.get(sRef);
    const batchSnap = await tx.get(bRef);

    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");
    if (!batchSnap.exists()) throw new Error("Lot introuvable.");

    const shipment = shipSnap.data() as Shipment;
    const batch = batchSnap.data() as { status: string; shipmentIds: string[]; vehicleId: string };

    if (shipment.currentStatus !== "STORED")
      throw new Error(`Envoi doit être en STORED pour être assigné (actuel: ${shipment.currentStatus}).`);
    if (batch.status !== "OPEN") throw new Error("Le lot doit être OPEN pour accepter des envois.");

    if (!canShipmentTransition("STORED", "ASSIGNED"))
      throw new Error("Transition STORED → ASSIGNED non autorisée.");
    if (batch.shipmentIds.includes(params.shipmentId))
      throw new Error("Cet envoi est déjà dans le lot.");

    tx.update(sRef, {
      currentStatus: "ASSIGNED",
      batchId: params.batchId,
      vehicleId: batch.vehicleId,
      currentAgencyId: params.agencyId,
    });

    const newShipmentIds = [...batch.shipmentIds, params.shipmentId];
    tx.update(bRef, { shipmentIds: newShipmentIds });

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId: params.shipmentId,
      eventType: "ASSIGNED_TO_BATCH",
      agencyId: params.agencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });
}
