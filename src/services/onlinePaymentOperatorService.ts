/**
 * Sync métier lorsque l’opérateur digital valide / rejette un paiement en ligne.
 * La page Digital Cash ne lit pas directement la collection `reservations` : toute la logique est ici.
 */

import { arrayUnion, collection, doc, getDoc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { createCashTransaction } from "@/modules/compagnie/cash/cashService";
import { createFinancialTransaction } from "@/modules/compagnie/treasury/financialTransactions";
import { LOCATION_TYPE } from "@/modules/compagnie/cash/cashTypes";
import { decrementReservedSeats } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { commitOperatorValidatedOnlineReservation } from "@/modules/compagnie/tripInstances/onlineReservationOperatorCommit";
import {
  buildStatutTransitionPayload,
  ensureOnlineReservationCommercialActivityLog,
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

function normalizeProviderKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

async function resolveOnlinePaymentProvider(reservation: Record<string, unknown>): Promise<string | null> {
  const selectedProvider = normalizeProviderKey(reservation.preuveVia);
  if (!selectedProvider) return null;

  try {
    const methodsSnap = await getDocs(collection(db, "paymentMethods"));
    for (const methodDoc of methodsSnap.docs) {
      const data = methodDoc.data() as Record<string, unknown>;
      const name = String(data.name ?? "").trim();
      const providerCode = String(data.providerCode ?? "").trim();
      if (
        selectedProvider === normalizeProviderKey(name)
        || selectedProvider === normalizeProviderKey(providerCode)
      ) {
        return name || providerCode || null;
      }
    }
  } catch (error) {
    console.warn("[onlinePaymentOperator] payment provider unresolved", error);
  }

  return null;
}

function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: unknown }).code) === "permission-denied"
  );
}

function reservationIsConfirmed(data: Record<string, unknown>): boolean {
  const status = String(data.status ?? "").toLowerCase();
  const statut = String(data.statut ?? "").toLowerCase();
  const paymentStatus = String(data.paymentStatus ?? "").toLowerCase();

  return (
    status === "confirme" &&
    statut === "confirme" &&
    paymentStatus === "paid"
  );
}

export type DigitalOperatorUser = { uid: string; role?: string | string[] | null };

/**
 * Valide le flux online : payment → validated, réservation → confirme,
 * puis tente les écritures secondaires sans casser la validation principale.
 */
export async function validatePendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser
): Promise<void> {
  const uid = user.uid ?? "";
  const role = Array.isArray(user.role) ? user.role.join(",") : String(user.role ?? "");

  console.warn("[ONLINE_PAYMENT_VALIDATE_PAYMENT_ATTEMPT]", {
    companyId,
    paymentId: payment.id,
    reservationId: payment.reservationId,
    agencyId: payment.agencyId,
    uid,
  });

  try {
    await confirmPayment(companyId, payment.id, uid);
  } catch (err) {
    console.error("[ONLINE_PAYMENT_VALIDATE_PAYMENT_FAILED]", {
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
    console.warn("[ONLINE_PAYMENT_VALIDATE_RESERVATION_NOT_FOUND]", {
      path: reservationRef.path,
      companyId,
      reservationId: payment.reservationId,
      uid,
    });
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

  if (!isConfirmable && !reservationIsConfirmed(reservationData)) {
    throw new Error("Cette réservation ne peut plus être confirmée.");
  }

  if (!reservationIsConfirmed(reservationData)) {
    console.warn("[ONLINE_PAYMENT_VALIDATE_BEFORE_COMMIT]", {
      companyId,
      paymentId: payment.id,
      reservationId: payment.reservationId,
      agencyId: payment.agencyId,
      uid,
      reservationPath: reservationRef.path,
      currentStatus: lifecycle,
      currentStatut: legacyStatut,
      canal: reservationData?.canal,
      paymentChannel: reservationData?.paymentChannel,
    });

    try {
      await commitOperatorValidatedOnlineReservation({
        reservationRef,
        companyId,
        paymentId: payment.id,
        uid,
        userRole: role,
      });
    } catch (err) {
      console.error("[ONLINE_PAYMENT_VALIDATE_COMMIT_FAILED]", {
        companyId,
        reservationId: payment.reservationId,
        uid,
        error: err,
      });

      const afterCommitSnap = await getDoc(reservationRef);
      const afterCommitData = afterCommitSnap.exists()
        ? (afterCommitSnap.data() as Record<string, unknown>)
        : null;

      if (isPermissionDenied(err) && afterCommitData && reservationIsConfirmed(afterCommitData)) {
        console.warn("[ONLINE_PAYMENT_VALIDATE_COMMIT_ALREADY_CONFIRMED_CONTINUE]", {
          path: reservationRef.path,
          companyId,
          reservationId: payment.reservationId,
          uid,
        });
      } else {
        throw err;
      }
    }
  }

  await ensureOnlineReservationCommercialActivityLog(reservationRef);

  const latestSnap = await getDoc(reservationRef);
  const latestData = latestSnap.exists()
    ? (latestSnap.data() as Record<string, unknown>)
    : reservationData;

  const montant = Number(latestData?.montant ?? payment.amount ?? 0);
  const paymentAmount = Number(payment.amount ?? 0);
  const paymentMethod = paymentMethodFromProvider(payment.provider);

  if (montant <= 0 || paymentAmount <= 0) return;

  const paymentProvider = await resolveOnlinePaymentProvider(latestData);

  await createFinancialTransaction({
    companyId,
    type: "payment_received",
    source: "online",
    paymentChannel: "online",
    paymentMethod: "mobile_money",
    paymentProvider,
    amount: paymentAmount,
    currency: payment.currency ?? "XOF",
    agencyId: payment.agencyId,
    reservationId: payment.reservationId,
    referenceType: "payment",
    referenceId: payment.id,
    metadata: {
      validatedBy: uid,
      accountingScope: "company_mobile_money",
      provider: paymentProvider,
      paymentProviderSource: paymentProvider ? "reservation.preuveVia" : null,
    },
  });

  try {
    await createCashTransaction({
      companyId,
      reservationId: payment.reservationId,
      sessionId: null,
      sourceType: "online",
      tripInstanceId: (latestData?.tripInstanceId as string | undefined) ?? undefined,
      amount: montant,
      currency: payment.currency ?? "XOF",
      paymentMethod,
      locationType: LOCATION_TYPE.AGENCE,
      locationId: payment.agencyId,
      routeId: (latestData?.routeId as string | undefined) ?? undefined,
      createdBy: uid,
    });
  } catch (err) {
    console.warn("[ONLINE_PAYMENT_VALIDATE_CASH_TX_SKIPPED_NON_BLOCKING]", {
      companyId,
      reservationId: payment.reservationId,
      uid,
      error: err,
    });
    return;
  }

}

/**
 * Rejette le payment puis refuse la réservation liée si elle existe.
 */
export async function rejectPendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser,
  reason?: string
): Promise<void> {
  const uid = user.uid ?? "";
  const role = Array.isArray(user.role) ? user.role.join(",") : String(user.role ?? "");

  console.warn("[ONLINE_PAYMENT_REJECT_PAYMENT_ATTEMPT]", {
    companyId,
    paymentId: payment.id,
    reservationId: payment.reservationId,
    agencyId: payment.agencyId,
    uid,
    reason,
  });

  try {
    await rejectPayment(companyId, payment.id, reason, uid);
  } catch (err) {
    console.error("[ONLINE_PAYMENT_REJECT_PAYMENT_FAILED]", {
      companyId,
      paymentId: payment.id,
      reservationId: payment.reservationId,
      agencyId: payment.agencyId,
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
  if (!reservationSnap.exists()) return;

  const reservationData = reservationSnap.data() as Record<string, unknown>;
  const lifecycle = String(reservationData?.status ?? "").toLowerCase();
  const legacyStatut = String(reservationData?.statut ?? "").toLowerCase();

  if (lifecycle === "refuse" || legacyStatut === "refuse") {
    console.warn("[ONLINE_PAYMENT_REJECT_RESERVATION_ALREADY_REFUSED]", {
      path: reservationRef.path,
      companyId,
      agencyId: payment.agencyId,
      reservationId: payment.reservationId,
      uid,
    });
    return;
  }

  const oldStatus = ["preuve_recue", "verification"].includes(legacyStatut)
    ? legacyStatut
    : lifecycle;

  const rejectionPayload = {
    status: "refuse",
    statut: "refuse",
    refusalReason: reason ?? "Raison non spécifiée",
    refusedBy: uid,
    refusedAt: serverTimestamp(),
    auditLog: arrayUnion(
      buildStatutTransitionPayload(oldStatus, "refuse", {
        userId: uid,
        userRole: role,
      })
    ),
    updatedAt: serverTimestamp(),
  };

  console.warn("[ONLINE_PAYMENT_REJECT_RESERVATION_ATTEMPT]", {
    path: reservationRef.path,
    companyId,
    agencyId: payment.agencyId,
    reservationId: payment.reservationId,
    uid,
    currentStatus: lifecycle,
    currentStatut: legacyStatut,
    canal: reservationData?.canal,
    paymentChannel: reservationData?.paymentChannel,
    payloadKeys: Object.keys(rejectionPayload),
    payload: rejectionPayload,
  });

  try {
    await updateDoc(reservationRef, rejectionPayload);
  } catch (err) {
    console.error("[ONLINE_PAYMENT_REJECT_RESERVATION_FAILED]", {
      path: reservationRef.path,
      companyId,
      agencyId: payment.agencyId,
      reservationId: payment.reservationId,
      uid,
      payloadKeys: Object.keys(rejectionPayload),
      error: err,
    });
    throw err;
  }

  const tripInstanceId = (reservationData?.tripInstanceId as string | null) ?? null;
  const seats =
    Number(reservationData?.seatsGo ?? 0) + Number(reservationData?.seatsReturn ?? 0);

  const seatsWereCommitted =
    reservationData?.seatsCommittedAt != null || reservationData?.seatHoldOnly === false;

  if (seatsWereCommitted && tripInstanceId && seats > 0) {
    try {
      await decrementReservedSeats(companyId, tripInstanceId, seats, {
        originStopOrder: reservationData?.originStopOrder as number | null | undefined,
        destinationStopOrder: reservationData?.destinationStopOrder as number | null | undefined,
        depart: String(reservationData?.depart ?? ""),
        arrivee: String(reservationData?.arrivee ?? ""),
      });
    } catch (err) {
      console.warn("[ONLINE_PAYMENT_REJECT_DECREMENT_SEATS_SKIPPED_NON_BLOCKING]", {
        companyId,
        reservationId: payment.reservationId,
        tripInstanceId,
        seats,
        uid,
        error: err,
      });
    }
  }
}
