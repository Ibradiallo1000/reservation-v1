/**
 * Teliya Logistics Engine — Append a shipment event (append-only, never overwrite history).
 * When event implies status change (CANCELLED, LOST, CLAIM_PAID), validates transition and updates shipment.
 * Uses runTransaction. No UI. Isolated.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentStatus } from "../domain/shipment.types";
import type { ShipmentEvent, ShipmentEventType } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";

/** Event types that imply a shipment status change */
const EVENT_TO_STATUS: Partial<Record<ShipmentEventType, ShipmentStatus>> = {
  CANCELLED: "CANCELLED",
  LOST: "LOST",
  CLAIM_PAID: "CLAIM_PAID",
};

export type RecordShipmentEventParams = {
  companyId: string;
  shipmentId: string;
  eventType: ShipmentEventType;
  agencyId: string;
  performedBy: string;
};

/**
 * Appends one event to logistics/events. Never overwrites history.
 * If eventType is CANCELLED, LOST or CLAIM_PAID, validates transition and updates shipment currentStatus.
 */
export async function recordShipmentEvent(params: RecordShipmentEventParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as Shipment;
    const newStatus = EVENT_TO_STATUS[params.eventType];

    if (newStatus !== undefined) {
      if (!canShipmentTransition(shipment.currentStatus, newStatus))
        throw new Error(
          `Transition ${shipment.currentStatus} → ${newStatus} non autorisée pour l'événement ${params.eventType}.`
        );
      tx.update(sRef, {
        currentStatus: newStatus,
        currentAgencyId: params.agencyId,
      });
    }

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId: params.shipmentId,
      eventType: params.eventType,
      agencyId: params.agencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });
}
