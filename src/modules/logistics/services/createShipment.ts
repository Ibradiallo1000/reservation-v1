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
import { incrementParcelCount } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { generateTrackingPublicId, generateTrackingToken } from "../utils/shipmentTrackingCrypto";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";
import { logAgentHistoryEvent } from "@/modules/agence/services/agentHistoryService";
import { writeCourierActivityInTransaction } from "@/modules/compagnie/activity/activityLogsService";
import { createFinancialTransaction } from "@/modules/compagnie/treasury/financialTransactions";
import { createPayment, getPaymentByReservationId, confirmPayment, markPaymentLedgerStatus } from "@/services/paymentService";

const SHIPMENT_SEQ_PAD = 5;

function generatePickupCode(): string {
  // 6 digits, lisible au téléphone (terrain).
  return String(Math.floor(100000 + Math.random() * 900000));
}

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
  /** Payment method for cash session expected balance when PAID_ORIGIN (default: cash). */
  paymentMethod?: "cash" | "mobile_money" | "bank";
  /** Optional link to trip instance. When set, shipment is attached to that instance and parcelCount is incremented. */
  tripInstanceId?: string | null;
  /** Code de retrait (si absent, généré automatiquement). */
  pickupCode?: string;
  offlineMeta?: {
    mode: "online" | "offline";
    transactionId?: string;
    deviceId?: string;
    createdAt?: number;
  };
};

export type CreateShipmentResult = {
  shipmentId: string;
  shipmentNumber?: string;
  trackingPublicId: string;
  trackingToken: string;
};

export async function createShipment(params: CreateShipmentParams): Promise<CreateShipmentResult> {
  const shipmentId =
    params.shipmentId ?? doc(shipmentsRef(db, params.companyId)).id;

  if (params.sessionId) {
    const total = Number(params.transportFee ?? 0) + Number(params.insuranceAmount ?? 0);
    if (total <= 0) {
      throw new Error("Montant d'encaissement obligatoire à l'origine (frais + assurance > 0).");
    }
    if (params.paymentType !== "ORIGIN" || params.paymentStatus !== "PAID_ORIGIN") {
      throw new Error("Paiement à l'origine obligatoire pour les envois en session courrier.");
    }
  }

  let shipmentNumber: string | undefined;
  const trackingPublicId = generateTrackingPublicId();
  const trackingToken = generateTrackingToken();

  const hasTripInstance =
    params.tripInstanceId != null && String(params.tripInstanceId).trim() !== "";
  const pickupCode = String(params.pickupCode ?? generatePickupCode()).trim();

  await runTransaction(db, async (tx) => {
    const sRef = shipmentRef(db, params.companyId, shipmentId);
    const sSnap = await tx.get(sRef);
    if (sSnap.exists()) throw new Error("Un envoi existe déjà avec cet id.");

    let counterRef: ReturnType<typeof doc> | null = null;
    let nextSeq: number | null = null;
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
      counterRef = doc(
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
      nextSeq = last + 1;
      shipmentNumber = `${params.companyCode}-${params.agencyCode}-${params.agentCode}-${String(nextSeq).padStart(SHIPMENT_SEQ_PAD, "0")}`;
    }

    if (counterRef && nextSeq != null) {
      tx.set(counterRef, { lastSeq: nextSeq, updatedAt: Timestamp.now() }, { merge: true });
    }

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
      transportStatus: hasTripInstance ? "ASSIGNED" : "PENDING_ASSIGNMENT",
      needsValidation: false,
      createdAt: serverTimestamp(),
      createdBy: params.createdBy,
      ...(params.sessionId != null && { sessionId: params.sessionId }),
      ...(params.agentCode != null && { agentCode: params.agentCode }),
      ...(hasTripInstance && { tripInstanceId: params.tripInstanceId }),
      creationMode: params.offlineMeta?.mode ?? "online",
      offlineTransactionId: params.offlineMeta?.transactionId ?? null,
      offlineDeviceId: params.offlineMeta?.deviceId ?? null,
      offlineCreatedAt: params.offlineMeta?.createdAt ?? null,
      trackingPublicId,
      trackingToken,
      pickupCode,
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

    const paidOriginOrDest =
      params.paymentStatus === "PAID_ORIGIN" || params.paymentStatus === "PAID_DESTINATION";
    if (paidOriginOrDest) {
      const courierAmount = Number(params.transportFee ?? 0) + Number(params.insuranceAmount ?? 0);
      if (courierAmount > 0) {
        writeCourierActivityInTransaction(tx, {
          companyId: params.companyId,
          originAgencyId: params.originAgencyId,
          shipmentId,
          amount: courierAmount,
          source: params.sessionId ? "guichet" : "online",
        });
      }
    }
  });

  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.originAgencyId,
    agentId: params.createdBy,
    role: "agentCourrier",
    type: "COLIS_CREATED",
    referenceId: shipmentId,
    status: "VALIDE",
    createdBy: params.createdBy,
    metadata: params.sessionId ? { courierSessionId: params.sessionId } : undefined,
  });

  if (!hasTripInstance) {
    console.info("[createShipment] Shipment created without tripInstanceId (transportStatus=PENDING_ASSIGNMENT)", {
      shipmentId,
      companyId: params.companyId,
      originAgencyId: params.originAgencyId,
    });
  }

  // Encaissement a l'origine : Payment + financialTransactions (best effort, non bloquant UI).
  if (params.paymentStatus === "PAID_ORIGIN") {
    const amount = Number(params.transportFee ?? 0) + Number(params.insuranceAmount ?? 0);
    if (amount > 0 && params.createdBy) {
      void (async () => {
        let paymentId: string | null = null;
        try {
          let ledgerWrittenViaConfirmPayment = false;
          const existing = await getPaymentByReservationId(params.companyId, shipmentId);
          if (!existing) {
            paymentId = await createPayment({
              reservationId: shipmentId,
              companyId: params.companyId,
              agencyId: params.originAgencyId,
              amount,
              currency: "XOF",
              channel: "courrier",
              provider: "cash",
              status: "validated",
              validatedBy: params.createdBy,
            });
          } else {
            paymentId = existing.id;
            if (existing.status === "validated" && existing.ledgerStatus === "posted") {
              ledgerWrittenViaConfirmPayment = true;
            } else if (existing.status === "pending") {
              const confirmed = await confirmPayment(params.companyId, existing.id, params.createdBy);
              ledgerWrittenViaConfirmPayment = confirmed?.ledgerStatus === "posted";
            }
          }

          if (!paymentId) return;

          if (!ledgerWrittenViaConfirmPayment) {
            const ledgerReferenceId =
              existing && existing.status === "validated"
                ? shipmentId
                : paymentId;
            const pm =
              params.paymentMethod === "mobile_money"
                ? "mobile_money"
                : params.paymentMethod === "bank"
                  ? "card"
                  : "cash";
            await createFinancialTransaction({
              companyId: params.companyId,
              type: "payment_received",
              source: "courrier",
              paymentChannel: "courrier",
              paymentMethod: pm,
              paymentProvider: pm === "mobile_money" ? "wave" : "cash",
              amount,
              currency: "XOF",
              agencyId: params.originAgencyId,
              reservationId: shipmentId,
              referenceType: "payment",
              referenceId: ledgerReferenceId,
              metadata: {
                channel: "courrier",
                mode: params.offlineMeta?.mode ?? "online",
                offlineTransactionId: params.offlineMeta?.transactionId ?? null,
                offlineDeviceId: params.offlineMeta?.deviceId ?? null,
                ...(params.sessionId ? { courierSessionId: params.sessionId } : {}),
              },
            });
            await markPaymentLedgerStatus({
              companyId: params.companyId,
              paymentId,
              ledgerStatus: "posted",
            }).catch((statusErr) => {
              console.warn("[createShipment] unable to set payment ledgerStatus=posted:", statusErr);
            });
            logAgentHistoryEvent({
              companyId: params.companyId,
              agencyId: params.originAgencyId,
              agentId: params.createdBy,
              role: "agentCourrier",
              type: "PAYMENT_RECEIVED",
              referenceId: shipmentId,
              amount,
              status: "VALIDE",
              createdBy: params.createdBy,
              metadata: {
                paymentMethod: pm,
                ...(params.sessionId ? { courierSessionId: params.sessionId } : {}),
              },
            });
          }
        } catch (err) {
          if (paymentId) {
            await markPaymentLedgerStatus({
              companyId: params.companyId,
              paymentId,
              ledgerStatus: "failed",
              errorMessage: err instanceof Error ? err.message : String(err),
            }).catch((statusErr) => {
              console.warn("[createShipment] unable to set payment ledgerStatus=failed:", statusErr);
            });
          }
          console.warn("[createShipment] create Payment+ledger courrier failed:", err);
        }
      })();
    }
  }

  // Trip instance aggregation: increment parcelCount when shipment is attached to an instance
  if (hasTripInstance && params.tripInstanceId) {
    incrementParcelCount(params.companyId, params.tripInstanceId, 1).catch(() => {});
  }

  // Do not block receipt rendering on public mirror sync.
  void afterLogisticsShipmentChanged(params.companyId, shipmentId, "createShipment");

  return { shipmentId, shipmentNumber, trackingPublicId, trackingToken };
}
