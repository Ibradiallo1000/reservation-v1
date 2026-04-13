/**
 * Business sync when digital operator validates / rejects an online payment.
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
import { upsertMobileMoneyValidationDocument } from "@/modules/finance/documents/financialDocumentsService";

function paymentMethodFromProvider(provider: string | undefined | null): string {
  const p = provider?.toLowerCase?.() ?? provider;
  if (!p) return "transfer";
  if (p === "cash") return "cash";
  if (p === "wave" || p === "orange" || p === "moov") return "mobile_money";
  return "transfer";
}

function normalizeLifecycleStatus(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type DigitalOperatorUser = { uid: string; role?: string | string[] | null };

const DIGITAL_OPERATOR_ALLOWED_ROLES = new Set<string>([
  "operator_digital",
  "admin_compagnie",
  "admin_platforme",
]);

function normalizeRoleTokens(role: string | string[] | null | undefined): string[] {
  if (Array.isArray(role)) {
    return role
      .map((r) => String(r ?? "").trim().toLowerCase())
      .filter(Boolean);
  }
  return String(role ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

function assertDigitalOperatorAuthorized(user: DigitalOperatorUser, action: "validate" | "reject"): void {
  const uid = String(user.uid ?? "").trim();
  if (!uid) {
    throw new Error("Utilisateur manquant pour le flux operateur digital.");
  }
  const roles = normalizeRoleTokens(user.role);
  const allowed = roles.some((r) => DIGITAL_OPERATOR_ALLOWED_ROLES.has(r));
  if (!allowed) {
    throw new Error(
      action === "validate"
        ? "Role non autorise pour valider un paiement online."
        : "Role non autorise pour rejeter un paiement online."
    );
  }
}

/**
 * Validate online flow: reservation + cashTransaction + payment validated + ledger posting.
 */
export async function validatePendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser
): Promise<void> {
  assertDigitalOperatorAuthorized(user, "validate");

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
  let reservationDataForDocument: Record<string, unknown> | null = null;
  if (reservationSnap.exists()) {
    const reservationData = reservationSnap.data() as Record<string, unknown>;
    reservationDataForDocument = reservationData;
    const lifecycleNormalized = normalizeLifecycleStatus(reservationData?.status);
    const lifecycleIsPaid = lifecycleNormalized === "paye";
    const legacyStatut = String(reservationData?.statut ?? "").toLowerCase();
    const isConfirmable =
      (lifecycleIsPaid && reservationData?.ticketValidatedAt == null) ||
      legacyStatut === "preuve_recue" ||
      legacyStatut === "verification" ||
      legacyStatut === "en_attente_paiement";
    if (!isConfirmable) {
      throw new Error("Cette reservation ne peut plus etre confirmee.");
    }

    await transitionToConfirmedOrPaidWithDailyStats(
      reservationRef,
      "confirme",
      { userId: uid, userRole: role },
      { validatedBy: uid }
    );

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
          await updateDoc(reservationRef, {
            ...(missingOriginId && { originStopId: journey.originStopId }),
            ...(missingDestId && { destinationStopId: journey.destinationStopId }),
            updatedAt: serverTimestamp(),
          });
        }
      }
    }

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

  const confirmed = await confirmPayment(companyId, payment.id, uid, {
    actorRole: user.role,
  });

  const providerNormalized = String(payment.provider ?? "").toLowerCase();
  const isMobileMoneyProvider =
    providerNormalized === "wave" ||
    providerNormalized === "orange" ||
    providerNormalized === "moov";
  if (isMobileMoneyProvider && confirmed?.status === "validated") {
    const actorRoleLabel = Array.isArray(user.role)
      ? String(user.role[0] ?? "").trim() || "operator_digital"
      : String(user.role ?? "").trim() || "operator_digital";
    const statutValidation =
      confirmed.ledgerStatus === "posted"
        ? "validee_ledger_posted"
        : confirmed.ledgerStatus === "failed"
          ? "validee_ledger_failed"
          : "validee_ledger_pending";
    const clientNom =
      String(
        reservationDataForDocument?.nomClient ??
          reservationDataForDocument?.clientName ??
          reservationDataForDocument?.fullName ??
          ""
      ).trim() || null;
    const numeroClient =
      String(
        reservationDataForDocument?.telephone ??
          reservationDataForDocument?.clientPhone ??
          reservationDataForDocument?.phone ??
          ""
      ).trim() || null;
    try {
      await upsertMobileMoneyValidationDocument({
        companyId,
        paymentId: payment.id,
        reservationOuOperationId: payment.reservationId,
        agencyId: payment.agencyId,
        clientNom,
        numeroClient,
        montant: Number(payment.amount ?? 0),
        operateur: {
          uid,
          role: actorRoleLabel,
          name: uid,
        },
        preuveVerifiee: true,
        referenceTransactionMobileMoney: payment.id,
        statutValidation,
        commentaire:
          confirmed.ledgerStatus === "failed"
            ? confirmed.ledgerError ?? "Validation mobile money: echec posting ledger."
            : "Validation mobile money operationnelle.",
        visaControle: null,
        dateHeure: new Date(),
        status: "ready_to_print",
        createdByUid: uid,
      });
    } catch (docError) {
      console.error("[onlinePaymentOperatorService] echec fiche validation mobile money", {
        companyId,
        paymentId: payment.id,
        docError,
      });
    }
  }

  if (reservationSnap.exists()) {
    const ledgerStatus = confirmed?.ledgerStatus ?? "pending";
    const reservationPatch: Record<string, unknown> = {
      ledgerStatus,
      "payment.ledgerStatus": ledgerStatus,
      updatedAt: serverTimestamp(),
    };
    if (ledgerStatus === "failed") {
      reservationPatch.paymentStatus = "finance_side_effects_failed";
      reservationPatch["payment.ledgerError"] = confirmed?.ledgerError ?? "ledger_write_failed";
    }
    await updateDoc(reservationRef, reservationPatch).catch((err) => {
      console.warn("[onlinePaymentOperatorService] reservation ledger patch failed:", err);
    });
  }
}

/**
 * Reject payment then cancel linked reservation (if exists).
 */
export async function rejectPendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser,
  reason?: string
): Promise<void> {
  assertDigitalOperatorAuthorized(user, "reject");

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
  const lifecycleNormalized = normalizeLifecycleStatus(reservationData?.status);
  const lifecycleIsPaid = lifecycleNormalized === "paye";
  if (lifecycleIsPaid || lifecycleNormalized === "en_attente") {
    await updateDoc(reservationRef, {
      status: "annulé",
      refusalReason: reason ?? "Raison non specifiee",
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
        refusalReason: reason ?? "Raison non specifiee",
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
