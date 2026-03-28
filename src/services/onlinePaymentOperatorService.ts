/**
 * Sync métier lorsque l’opérateur digital valide / rejette un paiement en ligne.
 * La page Digital Cash ne lit pas directement la collection `reservations` : toute la logique est ici.
 */

import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { createCashTransaction } from "@/modules/compagnie/cash/cashService";
import { LOCATION_TYPE } from "@/modules/compagnie/cash/cashTypes";
import { decrementReservedSeats } from "@/modules/compagnie/tripInstances/tripInstanceService";
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
  if (reservationSnap.exists()) {
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

    await transitionToConfirmedOrPaidWithDailyStats(
      reservationRef,
      "confirme",
      { userId: uid, userRole: role },
      { validatedBy: uid }
    );

    const montant = Number(reservationData?.montant ?? payment.amount ?? 0);
    const paymentMethod = paymentMethodFromProvider(payment.provider) as string;
    if (montant > 0) {
      const cashTxId = await createCashTransaction({
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

      await updateDoc(reservationRef, {
        cashTransactionId: cashTxId,
        paymentStatus: "paid",
        paymentMethod,
        updatedAt: serverTimestamp(),
      });
    }
  }

  await confirmPayment(companyId, payment.id, uid);
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
