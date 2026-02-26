/**
 * Teliya Logistics Engine — Confirm batch arrival: DEPARTED → ARRIVED, shipments IN_TRANSIT → ARRIVED.
 * Uses runTransaction, validates transitions, appends ARRIVED events. No UI. Isolated.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, batchRef, eventsRef } from "../domain/firestorePaths";

export type ConfirmArrivalParams = {
  companyId: string;
  batchId: string;
  performedBy: string;
  /** Agency where batch arrived (usually batch.arrivalAgencyId) */
  arrivalAgencyId: string;
};

export async function confirmArrival(params: ConfirmArrivalParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const bRef = batchRef(db, params.companyId, params.batchId);
    const batchSnap = await tx.get(bRef);
    if (!batchSnap.exists()) throw new Error("Lot introuvable.");

    const batch = batchSnap.data() as { status: string; shipmentIds: string[] };
    if (batch.status !== "DEPARTED") throw new Error("Le lot doit être DEPARTED pour confirmer l'arrivée.");

    for (const sid of batch.shipmentIds) {
      const sRef = shipmentRef(db, params.companyId, sid);
      const shipSnap = await tx.get(sRef);
      if (!shipSnap.exists()) throw new Error(`Envoi introuvable: ${sid}.`);
      const shipment = shipSnap.data() as Shipment;
      if (shipment.currentStatus !== "IN_TRANSIT")
        throw new Error(`Envoi ${sid} doit être IN_TRANSIT (actuel: ${shipment.currentStatus}).`);
      if (!canShipmentTransition("IN_TRANSIT", "ARRIVED"))
        throw new Error("Transition IN_TRANSIT → ARRIVED non autorisée.");

      tx.update(sRef, {
        currentStatus: "ARRIVED",
        currentAgencyId: params.arrivalAgencyId,
      });

      const eventsCol = eventsRef(db, params.companyId);
      const eventDoc = doc(eventsCol);
      const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
        shipmentId: sid,
        eventType: "ARRIVED",
        agencyId: params.arrivalAgencyId,
        performedBy: params.performedBy,
        performedAt: serverTimestamp(),
      };
      tx.set(eventDoc, event);
    }

    tx.update(bRef, { status: "ARRIVED" });
  });
}
