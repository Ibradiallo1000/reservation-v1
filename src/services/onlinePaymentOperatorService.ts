/**
 * Sync métier lorsque l’opérateur digital valide / rejette un paiement en ligne.
 * La page Digital Cash ne lit pas directement la collection `reservations` : toute la logique est ici.
 */

import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { createCashTransaction } from "@/modules/compagnie/cash/cashService";
import { LOCATION_TYPE } from "@/modules/compagnie/cash/cashTypes";
import { decrementReservedSeats, getTripInstance } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { resolveJourneyStopIdsFromCities } from "@/modules/compagnie/routes/stopResolution";
import {
  transitionToConfirmedOrPaidWithDailyStats,
  updateReservationStatut,
} from "@/modules/agence/services/reservationStatutService";
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
  const lifecycle = String(reservationData?.status ?? "");
  const legacyStatut = String(reservationData?.statut ?? "").toLowerCase();
  const isConfirmable =
    (lifecycle === "payé" && reservationData?.ticketValidatedAt == null) ||
    legacyStatut === "preuve_recue" ||
    legacyStatut === "verification" ||
    legacyStatut === "en_attente_paiement";
  if (!isConfirmable) {
    throw new Error("Cette réservation ne peut plus être confirmée.");
  }

  try {
    await transitionToConfirmedOrPaidWithDailyStats(
      reservationRef,
      "confirme",
      { userId: uid, userRole: role },
      { validatedBy: uid }
    );
  } catch (err) {
    console.error("[onlinePaymentOperatorService] transitionToConfirmedOrPaidWithDailyStats failed", {
      companyId,
      reservationId: payment.reservationId,
      uid,
      error: err,
    });
    throw err;
  }

  const tripInstanceIdConfirm = String(reservationData?.tripInstanceId ?? "").trim();
  const departConfirm = String(reservationData?.depart ?? "").trim();
  const arriveeConfirm = String(reservationData?.arrivee ?? "").trim();
  const missingOriginId =
    reservationData?.originStopId == null || String(reservationData.originStopId).trim() === "";
  const missingDestId =
    reservationData?.destinationStopId == null || String(reservationData.destinationStopId).trim() === "";
  if (tripInstanceIdConfirm && departConfirm && arriveeConfirm && (missingOriginId || missingDestId)) {
    const ti = await getTripInstance(companyId, tripInstanceIdConfirm);
    const routeIdConfirm = String((ti as { routeId?: unknown })?.routeId ?? "").trim();
    if (routeIdConfirm) {
      const journey = await resolveJourneyStopIdsFromCities(
        companyId,
        routeIdConfirm,
        departConfirm,
        arriveeConfirm
      );
      if (journey) {
        try {
          await updateDoc(reservationRef, {
            ...(missingOriginId && { originStopId: journey.originStopId }),
            ...(missingDestId && { destinationStopId: journey.destinationStopId }),
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("[onlinePaymentOperatorService] reservation origin/destination update failed", {
            companyId,
            reservationId: payment.reservationId,
            uid,
            error: err,
          });
          throw err;
        }
      }
    }
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

    try {
      await updateDoc(reservationRef, {
        cashTransactionId: cashTxId,
        paymentStatus: "paid",
        paymentMethod,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[onlinePaymentOperatorService] reservation final update failed", {
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
  const lifecycle = String(reservationData?.status ?? "");
  if (lifecycle === "payé" || lifecycle === "en_attente") {
    await updateDoc(reservationRef, {
      status: "annulé",
      refusalReason: reason ?? "Raison non spécifiée",
      refusedBy: uid,
      refusedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateReservationStatut(
      reservationRef,
      "refuse",
      { userId: uid, userRole: role },
      {
        refusalReason: reason ?? "Raison non spécifiée",
        refusedBy: uid,
        refusedAt: serverTimestamp(),
      }
    );
  }

  const tripInstanceId = (reservationData?.tripInstanceId as string | null) ?? null;
  const seats =
    Number(reservationData?.seatsGo ?? 0) + Number(reservationData?.seatsReturn ?? 0);
  if (tripInstanceId && seats > 0) {
    await decrementReservedSeats(companyId, tripInstanceId, seats, {
      originStopOrder: reservationData?.originStopOrder as number | null | undefined,
      destinationStopOrder: reservationData?.destinationStopOrder as number | null | undefined,
      depart: String(reservationData?.depart ?? ""),
      arrivee: String(reservationData?.arrivee ?? ""),
    });
  }
}
