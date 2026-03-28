/**
 * Teliya Logistics Engine — IN_TRANSIT → ARRIVED à l'agence de destination.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";

export type MarkShipmentArrivedParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  /** Agency where shipment is marked as arrived (must equal shipment.destinationAgencyId) */
  agencyId: string;
};

export async function markShipmentArrived(params: MarkShipmentArrivedParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as Shipment;
    if (shipment.destinationAgencyId !== params.agencyId) {
      throw new Error("Cet envoi ne peut être marqué arrivé que par l'agence de destination.");
    }
    const from = shipment.currentStatus;
    if (from !== "IN_TRANSIT") {
      throw new Error(`Envoi en statut ${from}. Seul IN_TRANSIT peut être marqué arrivé à destination.`);
    }
    if (!canShipmentTransition(from, "ARRIVED")) {
      throw new Error("Transition non autorisée.");
    }

    tx.update(sRef, {
      currentStatus: "ARRIVED",
      currentAgencyId: params.agencyId,
    });

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId: params.shipmentId,
      eventType: "ARRIVED",
      agencyId: params.agencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });

  await afterLogisticsShipmentChanged(params.companyId, params.shipmentId, "markShipmentArrived");
}
