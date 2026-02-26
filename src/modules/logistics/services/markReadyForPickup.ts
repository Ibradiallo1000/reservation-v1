/**
 * Teliya Logistics Engine — Mark shipment READY_FOR_PICKUP: ARRIVED → READY_FOR_PICKUP.
 * Used by reception page when shipment has arrived at destination agency.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";

export type MarkReadyForPickupParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  agencyId: string;
};

export async function markReadyForPickup(params: MarkReadyForPickupParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as Shipment;
    if (shipment.currentStatus !== "ARRIVED")
      throw new Error(`Envoi doit être ARRIVED (actuel: ${shipment.currentStatus}).`);
    if (!canShipmentTransition("ARRIVED", "READY_FOR_PICKUP"))
      throw new Error("Transition ARRIVED → READY_FOR_PICKUP non autorisée.");

    tx.update(sRef, {
      currentStatus: "READY_FOR_PICKUP",
      currentAgencyId: params.agencyId,
    });

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId: params.shipmentId,
      eventType: "READY_FOR_PICKUP",
      agencyId: params.agencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });
}
