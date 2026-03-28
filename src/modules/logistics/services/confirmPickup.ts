/**
 * Teliya Logistics Engine — Confirm pickup: READY_FOR_PICKUP → DELIVERED.
 * Aucun encaissement : paiement exclusivement à l'origine.
 */

import { deleteField, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../domain/firestorePaths";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";
import { logAgentHistoryEvent } from "@/modules/agence/services/agentHistoryService";

export type ConfirmPickupParams = {
  companyId: string;
  shipmentId: string;
  performedBy: string;
  agencyId: string;
  identityConfirmed: boolean;
  delegatedPickup?: boolean;
  pickupCodeInput?: string;
  pickupPhoneInput?: string;
  deviceId?: string;
  proof?: {
    type?: "signature" | "photo" | "otp";
    reference?: string;
  };
};

export async function confirmPickup(params: ConfirmPickupParams): Promise<void> {
  const pickupCodeInput = String(params.pickupCodeInput ?? "").trim();
  const pickupPhoneInput = String(params.pickupPhoneInput ?? "").replace(/\D/g, "");
  const delegated = params.delegatedPickup === true;
  let codeUsedForTrace: string | null = null;
  let proofTypeUsed: "signature" | "photo" | "otp" | null = null;
  let proofReferenceUsed = "";
  let identityValidated = false;
  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, params.shipmentId);
    const shipSnap = await tx.get(sRef);
    if (!shipSnap.exists()) throw new Error("Envoi introuvable.");

    const shipment = shipSnap.data() as {
      currentStatus: string;
      destinationAgencyId?: string;
      currentAgencyId?: string;
      needsValidation?: boolean;
      pickupCode?: string;
      pickupCodeUsed?: boolean | string | null;
      receiver?: { phone?: string };
    };

    if (shipment.destinationAgencyId && shipment.destinationAgencyId !== params.agencyId) {
      throw new Error("Cet envoi n'est pas destiné à votre agence.");
    }

    const status = String(shipment.currentStatus ?? "");
    const isReady = status === "READY_FOR_PICKUP";
    const isArrivedAndClear = status === "ARRIVED" && shipment.needsValidation === false;
    if (!isReady && !isArrivedAndClear) {
      throw new Error(`Envoi doit être prêt / en attente de remise (actuel: ${status}).`);
    }
    if (!canShipmentTransition("READY_FOR_PICKUP", "DELIVERED")) {
      throw new Error("Transition READY_FOR_PICKUP → DELIVERED non autorisée.");
    }

    if (shipment.pickupCodeUsed === true || (typeof shipment.pickupCodeUsed === "string" && shipment.pickupCodeUsed.trim() !== "")) {
      throw new Error("Ce code a déjà été utilisé");
    }

    const expectedPickupCode = String(shipment.pickupCode ?? "").trim();
    const receiverPhoneDigits = String(shipment.receiver?.phone ?? "").replace(/\D/g, "");
    const codeOk = expectedPickupCode.length > 0 && pickupCodeInput === expectedPickupCode;
    const phoneOk = pickupPhoneInput.length > 0 && receiverPhoneDigits.length > 0 && pickupPhoneInput === receiverPhoneDigits;
    if (delegated) {
      if (!codeOk) throw new Error("Code de retrait invalide.");
    } else if (!codeOk && !phoneOk) {
      throw new Error("Code ou téléphone invalide pour la remise.");
    }

    const proofType =
      params.proof?.type ??
      (codeOk ? "otp" : "signature");
    const proofReference =
      (params.proof?.reference ?? (codeOk ? pickupCodeInput : pickupPhoneInput)).trim();

    if (!proofType || !proofReference) {
      throw new Error("Une preuve est obligatoire pour remettre le colis");
    }
    proofTypeUsed = proofType;
    proofReferenceUsed = proofReference;
    codeUsedForTrace = codeOk ? pickupCodeInput : null;
    identityValidated = params.identityConfirmed || codeOk || phoneOk;

    tx.update(sRef, {
      currentStatus: "DELIVERED",
      currentAgencyId: params.agencyId,
      deliveredAt: serverTimestamp(),
      deliveredBy: params.performedBy,
      deliveredAgencyId: params.agencyId,
      deliveryIdentityConfirmed: identityValidated,
      identityConfirmed: identityValidated,
      proofType,
      proofReference,
      pickupCodeUsed: true,
      pickupCodeUsedValue: codeUsedForTrace,
      pickupCode: deleteField(),
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
      deliveryProof: {
        type: proofType,
        reference: proofReference,
        recordedAt: serverTimestamp(),
        recordedBy: params.performedBy,
      },
    });

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

  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: params.performedBy,
    role: "agentCourrier",
    type: "COLIS_REMIS",
    referenceId: params.shipmentId,
    status: "VALIDE",
    createdBy: params.performedBy,
    metadata: {
      identityConfirmed: identityValidated || null,
      delegatedPickup: delegated,
      proofType: proofTypeUsed,
      proofReference: proofReferenceUsed,
      pickupCodeUsed: true,
      pickupCodeUsedValue: codeUsedForTrace,
      deviceId: params.deviceId ?? null,
    },
  });

  await afterLogisticsShipmentChanged(params.companyId, params.shipmentId, "confirmPickup");
}
