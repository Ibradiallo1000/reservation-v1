/**
 * Teliya Logistics Engine — Create shipment (CREATED).
 * When sessionId is provided, session must be ACTIVE (courier session).
 * Uses runTransaction: session check, shipmentSeq counter, shipment write, CREATED event.
 * shipmentNumber format: COMPANYCODE-AGENCYCODE-AGENTCODE-SEQ (e.g. KMT-ABJ-C003-00042).
 */

import { doc, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { PaymentType, PaymentStatus, ShipmentSender, ShipmentReceiver } from "../domain/shipment.types";
import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import { shipmentRef, shipmentsRef, eventsRef } from "../domain/firestorePaths";
import { courierSessionRef } from "../domain/courierSessionPaths";

const SHIPMENT_SEQ_PAD = 5;

export type CreateShipmentParams = {
  companyId: string;
  originAgencyId: string;
  destinationAgencyId: string;
  sender: ShipmentSender;
  receiver: ShipmentReceiver;
  /** Nature of package (required in courier UI, e.g. "Documents", "Colis") */
  nature: string;
  declaredValue: number;
  insuranceRate: number;
  insuranceAmount: number;
  transportFee: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  createdBy: string;
  /** Courier session id; if provided, session must be ACTIVE and shipment will be linked */
  sessionId?: string;
  /** Agent code (required when sessionId is provided); used in shipmentNumber */
  agentCode?: string;
  /** Company short code for shipmentNumber (e.g. KMT). Required when agentCode is set. */
  companyCode?: string;
  /** Agency short code for shipmentNumber (e.g. ABJ). Required when agentCode is set. */
  agencyCode?: string;
  /** If not provided, a new document id is used */
  shipmentId?: string;
};

export type CreateShipmentResult = { shipmentId: string; shipmentNumber?: string };

export async function createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
  const shipmentId =
    params.shipmentId ?? doc(shipmentsRef(db, params.companyId)).id;

  let shipmentNumber: string | undefined;

  await runTransaction(db, async (tx) => {
    if (params.sessionId) {
      const sessionRef = courierSessionRef(
        db,
        params.companyId,
        params.originAgencyId,
        params.sessionId
      );
      const sessionSnap = await tx.get(sessionRef);
      if (!sessionSnap.exists()) throw new Error("Session courrier introuvable.");
      const status = (sessionSnap.data() as { status: string }).status;
      if (status !== "ACTIVE") {
        throw new Error("La session courrier doit être ACTIVE pour créer un envoi.");
      }
    }

    if (params.companyCode != null && params.agencyCode != null && params.agentCode != null) {
      const counterRef = doc(
        db,
        "companies",
        params.companyId,
        "agences",
        params.originAgencyId,
        "counters",
        "shipmentSeq"
      );
      const counterSnap = await tx.get(counterRef);
      const last = counterSnap.exists() ? (counterSnap.data()?.lastSeq ?? 0) : 0;
      const nextSeq = last + 1;
      tx.set(
        counterRef,
        { lastSeq: nextSeq, updatedAt: Timestamp.now() },
        { merge: true }
      );
      shipmentNumber = `${params.companyCode}-${params.agencyCode}-${params.agentCode}-${String(nextSeq).padStart(SHIPMENT_SEQ_PAD, "0")}`;
    }

    const sRef = shipmentRef(db, params.companyId, shipmentId);
    const snap = await tx.get(sRef);
    if (snap.exists()) throw new Error("Un envoi existe déjà avec cet id.");

    tx.set(sRef, {
      shipmentId,
      ...(shipmentNumber != null && { shipmentNumber }),
      originAgencyId: params.originAgencyId,
      destinationAgencyId: params.destinationAgencyId,
      sender: params.sender,
      receiver: params.receiver,
      nature: params.nature ?? "",
      declaredValue: params.declaredValue,
      insuranceRate: params.insuranceRate,
      insuranceAmount: params.insuranceAmount,
      transportFee: params.transportFee,
      paymentType: params.paymentType,
      paymentStatus: params.paymentStatus,
      currentStatus: "CREATED",
      currentAgencyId: params.originAgencyId,
      currentLocationAgencyId: params.originAgencyId,
      batchId: undefined,
      vehicleId: undefined,
      createdAt: serverTimestamp(),
      createdBy: params.createdBy,
      ...(params.sessionId != null && { sessionId: params.sessionId }),
      ...(params.agentCode != null && { agentCode: params.agentCode }),
    });

    const eventsCol = eventsRef(db, params.companyId);
    const eventDoc = doc(eventsCol);
    const event: Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> } = {
      shipmentId,
      eventType: "CREATED",
      agencyId: params.originAgencyId,
      performedBy: params.createdBy,
      performedAt: serverTimestamp(),
    };
    tx.set(eventDoc, event);
  });

  return { shipmentId, shipmentNumber };
}
