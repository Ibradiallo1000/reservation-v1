/**
 * Colis en session courrier : CREATED → IN_TRANSIT à l'agence d'origine (hors lot, ou complément lots).
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";

export type MarkShipmentInTransitParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  /** Agence d'origine uniquement */
  agencyId: string;
};

export async function markShipmentInTransit(params: MarkShipmentInTransitParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as Shipment;
    if (shipment.originAgencyId !== params.agencyId) {
      throw new Error("Seule l'agence d'expédition peut marquer l'envoi en transit.");
    }
    if (shipment.currentStatus !== "CREATED") {
      throw new Error(`Statut attendu CREATED (actuel: ${shipment.currentStatus}).`);
    }
    if (!canShipmentTransition("CREATED", "IN_TRANSIT")) {
      throw new Error("Transition CREATED → IN_TRANSIT non autorisée.");
    }

    tx.update(sRef, {
      currentStatus: "IN_TRANSIT",
      currentAgencyId: params.agencyId,
    });

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId: params.shipmentId,
      eventType: "DEPARTED",
      agencyId: params.agencyId,
      performedBy: params.performedBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });

  await afterLogisticsShipmentChanged(params.companyId, params.shipmentId, "markShipmentInTransit");
}