/**
 * Contrôle agent après proposition d’arrivée transport.
 *
 * Avant validation : `transportStatus = ARRIVED` + `needsValidation = true`, `currentStatus` reste `IN_TRANSIT`.
 * Après `confirmShipmentArrivalValidation` : `currentStatus = ARRIVED` + `needsValidation = false` (réalignement unique pour remise / reporting).
 *
 * Ne modifie pas la finance.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";

export type ConfirmShipmentArrivalValidationParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  agencyId: string;
};

export type ReportShipmentArrivalAnomalyParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  agencyId: string;
};

/**
 * Valide le contrôle physique : currentStatus IN_TRANSIT → ARRIVED, needsValidation → false.
 * Prérequis : destination = agencyId, transportStatus ARRIVED, needsValidation true.
 */
export async function confirmShipmentArrivalValidation(
  params: ConfirmShipmentArrivalValidationParams
): Promise<void> {
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as Shipment;
    if (shipment.destinationAgencyId !== params.agencyId) {
      throw new Error("Cet envoi ne peut être contrôlé que par l'agence de destination.");
    }
    if (shipment.transportStatus !== "ARRIVED" || !shipment.needsValidation) {
      throw new Error("Aucune arrivée transport en attente de contrôle pour cet envoi.");
    }

    const from = shipment.currentStatus;
    if (from !== "IN_TRANSIT") {
      throw new Error(
        `Contrôle impossible : statut opérationnel attendu IN_TRANSIT (actuel : ${from}).`
      );
    }
    if (!canShipmentTransition(from, "ARRIVED")) {
      throw new Error("Transition IN_TRANSIT → ARRIVED non autorisée.");
    }

    tx.update(sRef, {
      currentStatus: "ARRIVED",
      currentAgencyId: params.agencyId,
      needsValidation: false,
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

  console.info("[shipmentArrivalControlService] agent validated arrival control", {
    shipmentId: params.shipmentId,
    agencyId: params.agencyId,
    performedBy: params.performedBy,
  });

  await afterLogisticsShipmentChanged(params.companyId, params.shipmentId, "confirmShipmentArrivalValidation");
}

/**
 * Signale une anomalie sur un arrivage proposé (flag + log ; needsValidation inchangé).
 */
export async function reportShipmentArrivalAnomaly(params: ReportShipmentArrivalAnomalyParams): Promise<void> {
  const sRef = shipmentRef(db, params.companyId, params.shipmentId);
  await runTransaction(db, async (tx) => {
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");
    const shipment = shipSnap.data() as Shipment;
    if (shipment.destinationAgencyId !== params.agencyId) {
      throw new Error("Cet envoi ne concerne pas cette agence.");
    }
    if (shipment.transportStatus !== "ARRIVED" || !shipment.needsValidation) {
      throw new Error("Aucune arrivée en attente de contrôle.");
    }

    tx.update(sRef, {
      arrivalAnomalyFlag: true,
      arrivalAnomalyAt: serverTimestamp(),
      arrivalAnomalyBy: params.performedBy,
    });
  });

  console.warn("[shipmentArrivalControlService] arrival anomaly reported", {
    shipmentId: params.shipmentId,
    agencyId: params.agencyId,
    performedBy: params.performedBy,
  });
}
