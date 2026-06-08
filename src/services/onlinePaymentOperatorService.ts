/**
 * Sync métier lorsque l’opérateur digital valide / rejette un paiement en ligne.
 * La page Digital Cash ne lit pas directement la collection `reservations` : toute la logique est ici.
 */

import { arrayUnion, doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { createCashTransaction } from "@/modules/compagnie/cash/cashService";
import { LOCATION_TYPE } from "@/modules/compagnie/cash/cashTypes";
import { decrementReservedSeats } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { commitOperatorValidatedOnlineReservation } from "@/modules/compagnie/tripInstances/onlineReservationOperatorCommit";
import { buildStatutTransitionPayload } from "@/modules/agence/services/reservationStatutService";
import type { Payment } from "@/types/payment";
import { confirmPayment, rejectPayment } from "./paymentService";

function paymentMethodFromProvider(provider: string | undefined | null): string {
  const p = provider?.toLowerCase?.() ?? provider;
  if (!p) return "transfer";
  if (p === "cash") return "cash";
  if (p === "wave" || p === "orange" || p === "moov") return "mobile_money";
  return "transfer";
}

export type DigitalOperatorUser = { uid: string; role?: string | string[] | null };

/**
 * Valide le flux online : réservation (si présente) + cashTransaction + payment → validated + financialMovement.
 */
export async function validatePendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser
): Promise<void> {
  const uid = user.uid ?? "";
  const role = Array.isArray(user.role) ? user.role.join(",") : String(user.role ?? "");

  try {
    await confirmPayment(companyId, payment.id, uid);
  } catch (err) {
    console.error("[onlinePaymentOperatorService] confirmPayment failed", {
      companyId,
      paymentId: payment.id,
      uid,
      error: err,
    });
    throw err;
  }

  const reservationRef = doc(
    db,
    "companies",
    companyId,
    "agences",
    payment.agencyId,
    "reservations",
    payment.reservationId
  );
  const reservationSnap = await getDoc(reservationRef);
  if (!reservationSnap.exists()) {
    return;
  }

  const reservationData = reservationSnap.data() as Record<string, unknown>;
  const lifecycle = String(reservationData?.status ?? "").toLowerCase();
  const legacyStatut = String(reservationData?.statut ?? "").toLowerCase();
  const isConfirmable =
    lifecycle === "preuve_recue" ||
    lifecycle === "verification" ||
    legacyStatut === "preuve_recue" ||
    legacyStatut === "verification";
  if (!isConfirmable) {
    throw new Error("Cette réservation ne peut plus être confirmée.");
  }

  try {
    await commitOperatorValidatedOnlineReservation({
      reservationRef,
      companyId,
      paymentId: payment.id,
      uid,
      userRole: role,
    });
  } catch (err) {
    console.error("[onlinePaymentOperatorService] commitOperatorValidatedOnlineReservation failed", {
      companyId,
      reservationId: payment.reservationId,
      uid,
      error: err,
    });
    throw err;
  }

  const montant = Number(reservationData?.montant ?? payment.amount ?? 0);
  const paymentMethod = paymentMethodFromProvider(payment.provider) as string;
  if (montant > 0) {
    let cashTxId: string;
    try {
      cashTxId = await createCashTransaction({
        companyId,
        reservationId: payment.reservationId,
        sessionId: null,
        sourceType: "online",
        tripInstanceId: (reservationData?.tripInstanceId as string | undefined) ?? undefined,
        amount: montant,
        currency: payment.currency ?? "XOF",
        paymentMethod,
        locationType: LOCATION_TYPE.AGENCE,
        locationId: payment.agencyId,
        routeId: (reservationData?.routeId as string | undefined) ?? undefined,
        createdBy: uid,
      });
    } catch (err) {
      console.error("[onlinePaymentOperatorService] createCashTransaction failed", {
        companyId,
        reservationId: payment.reservationId,
        uid,
        error: err,
      });
      throw err;
    }

    const finalizationPayload = {
      cashTransactionId: cashTxId,
      paymentStatus: "paid",
      paymentMethod,
      updatedAt: serverTimestamp(),
    };
    console.warn("[ONLINE_PAYMENT_RESERVATION_FINALIZATION_ATTEMPT]", {
      path: reservationRef.path,
      payload: finalizationPayload,
      payloadKeys: Object.keys(finalizationPayload),
      companyId,
      agencyId: payment.agencyId,
      reservationId: payment.reservationId,
      uid,
    });
    try {
      await updateDoc(reservationRef, finalizationPayload);
    } catch (err) {
      console.error("[onlinePaymentOperatorService] reservation final update failed", {
        path: reservationRef.path,
        payloadKeys: Object.keys(finalizationPayload),
        companyId,
        reservationId: payment.reservationId,
        cashTransactionId: cashTxId,
        uid,
        error: err,
      });
      throw err;
    }
  }
}

/**
 * Rejette le payment puis annule la réservation liée (si elle existe).
 */
export async function rejectPendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser,
  reason?: string
): Promise<void> {
  const uid = user.uid ?? "";
  const role = Array.isArray(user.role) ? user.role.join(",") : String(user.role ?? "");

  await rejectPayment(companyId, payment.id, reason, uid);

  const reservationRef = doc(
    db,
    "companies",
    companyId,
    "agences",
    payment.agencyId,
    "reservations",
    payment.reservationId
  );
  const reservationSnap = await getDoc(reservationRef);
  if (!reservationSnap.exists()) return;

  const reservationData = reservationSnap.data() as Record<string, unknown>;
  const lifecycle = String(reservationData?.status ?? "").toLowerCase();
  const legacyStatut = String(reservationData?.statut ?? "").toLowerCase();
  const oldStatus = ["preuve_recue", "verification"].includes(legacyStatut)
    ? legacyStatut
    : lifecycle;
  const rejectionPayload = {
    status: "refuse",
    statut: "refuse",
    refusalReason: reason ?? "Raison non spécifiée",
    refusedBy: uid,
    refusedAt: serverTimestamp(),
    auditLog: arrayUnion(buildStatutTransitionPayload(oldStatus, "refuse", {
      userId: uid,
      userRole: role,
    })),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(reservationRef, rejectionPayload);

  const tripInstanceId = (reservationData?.tripInstanceId as string | null) ?? null;
  const seats =
    Number(reservationData?.seatsGo ?? 0) + Number(reservationData?.seatsReturn ?? 0);
  const seatsWereCommitted =
    reservationData?.seatsCommittedAt != null || reservationData?.seatHoldOnly === false;
  if (seatsWereCommitted && tripInstanceId && seats > 0) {
    await decrementReservedSeats(companyId, tripInstanceId, seats, {
      originStopOrder: reservationData?.originStopOrder as number | null | undefined,
      destinationStopOrder: reservationData?.destinationStopOrder as number | null | undefined,
      depart: String(reservationData?.depart ?? ""),
      arrivee: String(reservationData?.arrivee ?? ""),
    });
  }
}
