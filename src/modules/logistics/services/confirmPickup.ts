/**
 * Teliya Logistics Engine — Confirm pickup: READY_FOR_PICKUP → DELIVERED.
 * Uses runTransaction, validates transition, appends DELIVERED event. No UI. Isolated.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";

export type ConfirmPickupParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  agencyId: string;
  /** Optional amount collected at destination (payment at destination) */
  destinationCollectedAmount?: number;
};

export async function confirmPickup(params: ConfirmPickupParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as Shipment;
    if (shipment.currentStatus !== "READY_FOR_PICKUP")
      throw new Error(`Envoi doit être READY_FOR_PICKUP (actuel: ${shipment.currentStatus}).`);
    if (!canShipmentTransition("READY_FOR_PICKUP", "DELIVERED"))
      throw new Error("Transition READY_FOR_PICKUP → DELIVERED non autorisée.");

    const updateData: Record<string, unknown> = {
      currentStatus: "DELIVERED",
      currentAgencyId: params.agencyId,
    };
    if (params.destinationCollectedAmount != null && params.destinationCollectedAmount >= 0) {
      updateData.destinationCollectedAmount = params.destinationCollectedAmount;
    }
    tx.update(sRef, updateData);

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId: params.shipmentId,
      eventType: "DELIVERED",
      agencyId: params.agencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });
}
