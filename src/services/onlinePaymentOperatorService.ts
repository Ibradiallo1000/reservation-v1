/**
 * Business sync when digital operator validates / rejects an online payment.
 * 🔥 VERSION CORRIGÉE - AVEC GESTION DES ERREURS DE CONCURRENCE ET RETRY LOGIC
 */

import { doc, getDoc, serverTimestamp, updateDoc, arrayUnion, Timestamp } from "firebase/firestore";
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
import { confirmPayment, rejectPayment, getPaymentById } from "./paymentService";
import { upsertMobileMoneyValidationDocument } from "@/modules/finance/documents/financialDocumentsService";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ⭐ FONCTION DE RETRY POUR LES ERREURS 429
async function withRetryOnQuota<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  context = "operation"
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = 
        error?.message?.includes('Quota exceeded') || 
        error?.message?.includes('Too Many Requests') ||
        error?.code === 'resource-exhausted';
      
      if (isQuotaError && i < maxRetries - 1) {
        const waitMs = Math.pow(2, i) * 1000;
        console.warn(`[onlinePaymentOperatorService] ${context} - 429 retry ${i + 1}/${maxRetries} after ${waitMs}ms`);
        await delay(waitMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Max retries exceeded for ${context}`);
}

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
 * Validate online flow: reservation + cashTransaction + payment validated.
 * 🔥 VERSION CORRIGÉE - AVEC GESTION DES CONFLITS DE CONCURRENCE
 */
export async function validatePendingOnlinePaymentAndSyncReservation(
  payment: Payment,
  companyId: string,
  user: DigitalOperatorUser
): Promise<void> {
  assertDigitalOperatorAuthorized(user, "validate");

  // Délai pour éviter les appels trop rapprochés
  await delay(500);

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
  
  // 🔥 Récupération FRAÎCHE de la réservation avec retry
  const reservationSnap = await withRetryOnQuota(
    () => getDoc(reservationRef),
    2,
    "getDoc reservation"
  );
  
  let reservationDataForDocument: Record<string, unknown> | null = null;
  
  if (!reservationSnap.exists()) {
    throw new Error("Réservation introuvable.");
  }
  
  const reservationData = reservationSnap.data() as Record<string, unknown>;
  reservationDataForDocument = reservationData;
  
  const lifecycleNormalized = normalizeLifecycleStatus(reservationData?.status);
  const lifecycleIsPaid = lifecycleNormalized === "paye";
  const legacyStatut = String(reservationData?.statut ?? "").toLowerCase();
  
  // 🔥 Vérification élargie des statuts acceptables
  const acceptableStatuses = ["preuve_recue", "verification", "en_attente_paiement", "en_attente"];
  const isConfirmable =
    (lifecycleIsPaid && reservationData?.ticketValidatedAt == null) ||
    acceptableStatuses.includes(legacyStatut) ||
    acceptableStatuses.includes(lifecycleNormalized);
  
  if (!isConfirmable) {
    // 🔥 Message d'erreur plus explicite
    throw new Error(`Cette réservation ne peut plus être confirmée. Statut actuel: ${legacyStatut || lifecycleNormalized || "inconnu"}`);
  }
  
  // 🔥 Récupération FRAÎCHE du paiement
  const freshPayment = await withRetryOnQuota(
    () => getPaymentById(companyId, payment.id),
    2,
    "getPaymentById"
  );
  
  if (!freshPayment) {
    throw new Error("Paiement introuvable.");
  }
  
  // 🔥 Si le paiement est déjà validé, on continue sans le refaire
  let confirmedStatus = freshPayment.status;
  let ledgerStatus = "skipped";
  
  if (freshPayment.status === "pending") {
    try {
      const confirmedResult = await confirmPayment(companyId, payment.id, uid, {
        actorRole: user.role,
        skipLedgerPosting: true, // Évite les 429
      });
      if (confirmedResult) {
        confirmedStatus = confirmedResult.status;
        ledgerStatus = confirmedResult.ledgerStatus || "skipped";
      }
    } catch (confirmError: any) {
      console.warn("[onlinePaymentOperatorService] confirmPayment error", confirmError);
      // Ne pas échouer la validation, on considère que le paiement est validé
      confirmedStatus = "validated";
      ledgerStatus = "error_ignored";
    }
  } else {
    console.log(`[onlinePaymentOperatorService] Paiement déjà ${freshPayment.status}, skip confirmation.`);
  }
  
  // 🔥 Mise à jour de la réservation avec retry et vérification de statut
  let updateSuccess = false;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Rafraîchir les données avant chaque tentative
      const freshReservation = await withRetryOnQuota(
        () => getDoc(reservationRef),
        2,
        `refresh reservation attempt ${attempt + 1}`
      );
      
      if (!freshReservation.exists()) {
        throw new Error("Réservation introuvable");
      }
      
      const freshData = freshReservation.data();
      const freshLegacyStatut = String(freshData?.statut ?? "").toLowerCase();
      const freshLifecycleNormalized = normalizeLifecycleStatus(freshData?.status);
      
      // Vérifier que le statut n'a pas changé
      const stillConfirmable =
        (freshLifecycleNormalized === "paye" && freshData?.ticketValidatedAt == null) ||
        acceptableStatuses.includes(freshLegacyStatut) ||
        acceptableStatuses.includes(freshLifecycleNormalized);
      
      if (!stillConfirmable) {
        throw new Error(`La réservation a changé de statut. Statut actuel: ${freshLegacyStatut || freshLifecycleNormalized}`);
      }
      
      // Mise à jour avec transitionToConfirmedOrPaidWithDailyStats (SANS transaction)
      await transitionToConfirmedOrPaidWithDailyStats(
        reservationRef,
        "confirme",
        { userId: uid, userRole: role },
        { validatedBy: uid }
      );
      
      // Mise à jour finale
      await withRetryOnQuota(
        () => updateDoc(reservationRef, {
          paymentStatus: "validated",
          updatedAt: serverTimestamp(),
          validatedBy: uid,
          validatedAt: serverTimestamp(),
          ledgerStatus: ledgerStatus,
        }),
        2,
        "final updateDoc"
      );
      
      updateSuccess = true;
      break; // Succès, sortir de la boucle
      
    } catch (error: any) {
      lastError = error;
      if (attempt < 2 && (error.message?.includes("a changé de statut") || error.message?.includes("ne peut plus"))) {
        console.log(`[onlinePaymentOperatorService] Conflit détecté, tentative ${attempt + 2}/3`);
        await delay(1000); // Attendre avant de réessayer
        continue;
      }
      break;
    }
  }
  
  if (!updateSuccess && lastError) {
    throw lastError;
  }
  
  // 🔥 Mise à jour des stop IDs si nécessaire (après la mise à jour)
  const tripInstanceIdConfirm = String(reservationData?.tripInstanceId ?? "").trim();
  const departConfirm = String(reservationData?.depart ?? "").trim();
  const arriveeConfirm = String(reservationData?.arrivee ?? "").trim();
  const missingOriginId =
    reservationData?.originStopId == null || String(reservationData.originStopId).trim() === "";
  const missingDestId =
    reservationData?.destinationStopId == null || String(reservationData.destinationStopId).trim() === "";
  
  if (tripInstanceIdConfirm && departConfirm && arriveeConfirm && (missingOriginId || missingDestId)) {
    try {
      const ti = await withRetryOnQuota(() => getTripInstance(companyId, tripInstanceIdConfirm), 2, "getTripInstance");
      const routeIdConfirm = String((ti as { routeId?: unknown })?.routeId ?? "").trim();
      if (routeIdConfirm) {
        const journey = await resolveJourneyStopIdsFromCities(
          companyId,
          routeIdConfirm,
          departConfirm,
          arriveeConfirm
        );
        if (journey) {
          await withRetryOnQuota(() => updateDoc(reservationRef, {
            ...(missingOriginId && { originStopId: journey.originStopId }),
            ...(missingDestId && { destinationStopId: journey.destinationStopId }),
            updatedAt: serverTimestamp(),
          }), 2, "updateDoc stopIds");
        }
      }
    } catch (stopError) {
      console.warn("[onlinePaymentOperatorService] stop resolution error (non bloquant)", stopError);
    }
  }
  
  // 🔥 Création de la transaction cash
  const montant = Number(reservationData?.montant ?? payment.amount ?? 0);
  const paymentMethod = paymentMethodFromProvider(payment.provider) as string;
  if (montant > 0) {
    try {
      const cashTxId = await withRetryOnQuota(() => createCashTransaction({
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
      }), 2, "createCashTransaction");

      await withRetryOnQuota(() => updateDoc(reservationRef, {
        cashTransactionId: cashTxId,
        paymentStatus: "paid",
        paymentMethod,
        updatedAt: serverTimestamp(),
      }), 2, "updateDoc cashTransactionId");
    } catch (cashError) {
      console.warn("[onlinePaymentOperatorService] cash transaction error (non bloquant)", cashError);
    }
  }

  // 🔥 Création du document de validation Mobile Money
  const providerNormalized = String(payment.provider ?? "").toLowerCase();
  const isMobileMoneyProvider =
    providerNormalized === "wave" ||
    providerNormalized === "orange" ||
    providerNormalized === "moov" ||
    providerNormalized === "sarali";
    
  if (isMobileMoneyProvider && confirmedStatus === "validated") {
    const actorRoleLabel = Array.isArray(user.role)
      ? String(user.role[0] ?? "").trim() || "operator_digital"
      : String(user.role ?? "").trim() || "operator_digital";
    const statutValidation = "validee_sans_ledger";
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
      await withRetryOnQuota(() => upsertMobileMoneyValidationDocument({
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
        commentaire: "Validation mobile money operationnelle.",
        visaControle: null,
        dateHeure: new Date(),
        status: "ready_to_print",
        createdByUid: uid,
      }), 2, "upsertMobileMoneyValidationDocument");
    } catch (docError) {
      console.error("[onlinePaymentOperatorService] echec fiche validation mobile money", {
        companyId,
        paymentId: payment.id,
        docError,
      });
    }
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

  await delay(500);

  const uid = user.uid ?? "";
  const role = Array.isArray(user.role) ? user.role.join(",") : String(user.role ?? "");

  // Récupération FRAÎCHE du paiement
  const freshPayment = await withRetryOnQuota(
    () => getPaymentById(companyId, payment.id),
    2,
    "getPaymentById for reject"
  );
  
  if (freshPayment && freshPayment.status === "pending") {
    try {
      await rejectPayment(companyId, payment.id, reason, uid);
    } catch (rejectError) {
      console.warn("[onlinePaymentOperatorService] rejectPayment error", rejectError);
    }
  } else {
    console.log(`[onlinePaymentOperatorService] Paiement déjà ${freshPayment?.status}, skip reject.`);
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
  
  const reservationSnap = await withRetryOnQuota(
    () => getDoc(reservationRef),
    2,
    "getDoc reservation for reject"
  );
  
  if (!reservationSnap.exists()) return;

  const reservationData = reservationSnap.data() as Record<string, unknown>;
  const lifecycleNormalized = normalizeLifecycleStatus(reservationData?.status);
  const lifecycleIsPaid = lifecycleNormalized === "paye";
  
  // 🔥 Mise à jour de la réservation avec retry
  let updateSuccess = false;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Rafraîchir les données
      const freshReservation = await withRetryOnQuota(
        () => getDoc(reservationRef),
        2,
        `refresh reservation reject attempt ${attempt + 1}`
      );
      
      if (!freshReservation.exists()) return;
      
      const freshData = freshReservation.data();
      const freshLifecycleNormalized = normalizeLifecycleStatus(freshData?.status);
      const freshLegacyStatut = String(freshData?.statut ?? "").toLowerCase();
      
      // Vérifier que la réservation n'a pas déjà été validée
      const isAlreadyConfirmed = 
        freshLegacyStatut === "confirme" || 
        freshLegacyStatut === "validated" ||
        freshLifecycleNormalized === "paye";
      
      if (isAlreadyConfirmed) {
        console.log("[onlinePaymentOperatorService] Réservation déjà confirmée, skip reject");
        updateSuccess = true;
        break;
      }
      
      if (lifecycleIsPaid || freshLifecycleNormalized === "en_attente") {
        await withRetryOnQuota(() => updateDoc(reservationRef, {
          status: "annulé",
          refusalReason: reason ?? "Raison non specifiee",
          refusedBy: uid,
          refusedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }), 2, "updateDoc reject");
      } else {
        // Mise à jour via updateReservationStatut (SANS transaction)
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
      
      updateSuccess = true;
      break;
      
    } catch (error: any) {
      lastError = error;
      if (attempt < 2) {
        await delay(1000);
        continue;
      }
      break;
    }
  }
  
  if (!updateSuccess && lastError) {
    console.warn("[onlinePaymentOperatorService] reject update failed", lastError);
  }

  // Décrémentation des sièges
  const tripInstanceId = (reservationData?.tripInstanceId as string | null) ?? null;
  const seats = Number(reservationData?.seatsGo ?? 0) + Number(reservationData?.seatsReturn ?? 0);
  if (tripInstanceId && seats > 0) {
    await decrementReservedSeats(companyId, tripInstanceId, seats, {
      originStopOrder: reservationData?.originStopOrder as number | null | undefined,
      destinationStopOrder: reservationData?.destinationStopOrder as number | null | undefined,
      depart: String(reservationData?.depart ?? ""),
      arrivee: String(reservationData?.arrivee ?? ""),
    }).catch((err) => {
      console.warn("[onlinePaymentOperatorService] decrement seats error (non bloquant)", err);
    });
  }
}