/**
 * Phase B — Point d'entrée unique pour toute transition de statut réservation.
 * Ne pas faire updateDoc direct sur le champ statut : utiliser ce service pour garantir auditLog.
 * When transitioning to confirme/paye, dailyStats.ticketRevenue is updated for en_ligne reservations (once per reservation).
 */

import {
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  runTransaction,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { isValidTransition } from "@/utils/reservationStatusUtils";
import { addTicketRevenueToDailyStats, formatDateForDailyStats } from "@/modules/agence/aggregates/dailyStats";

export type StatutTransitionMeta = {
  userId: string;
  userRole: string;
};

/** Statuts that count as "revenue" for dailyStats (online only; guichet uses session validation). */
const REVENUE_STATUTS = new Set(["confirme", "paye"]);

/** Entrée à pousser dans auditLog (arrayUnion). date doit être une valeur sérialisable (Timestamp), pas serverTimestamp(). */
export type AuditLogEntry = {
  action: "transition_statut";
  ancienStatut: string;
  nouveauStatut: string;
  effectuePar: string;
  role: string;
  date: Timestamp;
};

/**
 * Construit l'entrée auditLog pour une transition (à merger avec arrayUnion dans un update).
 * Utilise Timestamp.now() car serverTimestamp() ne peut pas être passé à arrayUnion().
 */
export function buildStatutTransitionPayload(
  oldStatut: string,
  newStatut: string,
  meta: StatutTransitionMeta
): AuditLogEntry {
  return {
    action: "transition_statut",
    ancienStatut: oldStatut,
    nouveauStatut: newStatut,
    effectuePar: meta.userId,
    role: meta.userRole,
    date: Timestamp.now(),
  };
}

/**
 * Transitions a reservation to confirme or paye in a transaction: validates transition,
 * updates dailyStats.ticketRevenue/totalRevenue once for en_ligne reservations (no duplicate increments),
 * then updates the reservation (statut, ticketRevenueCountedInDailyStats, auditLog).
 * Use this when confirming/paid online. Guichet revenue is handled by session validation.
 */
export async function transitionToConfirmedOrPaidWithDailyStats(
  ref: DocumentReference,
  newStatut: string,
  meta: StatutTransitionMeta,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (!REVENUE_STATUTS.has(newStatut)) {
    throw new Error("transitionToConfirmedOrPaidWithDailyStats only supports confirme or paye");
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Réservation introuvable.");
    const data = snap.data() as Record<string, unknown>;
    const oldStatut = (data?.statut ?? "") as string;

    if (!isValidTransition(oldStatut, newStatut)) {
      throw new Error(`Transition non autorisée : ${oldStatut} → ${newStatut}`);
    }

    const auditEntry = buildStatutTransitionPayload(oldStatut, newStatut, meta);
    const companyId = (data?.companyId ?? "") as string;
    const agencyId = (data?.agencyId ?? "") as string;
    const canal = ((data?.canal ?? "") as string).toLowerCase();
    const alreadyCounted = Boolean(data?.ticketRevenueCountedInDailyStats);
    const montant = Number(data?.montant ?? 0);

    const shouldAddToDailyStats =
      !alreadyCounted &&
      canal !== "guichet" &&
      montant > 0 &&
      companyId &&
      agencyId;

    if (shouldAddToDailyStats) {
      const dateStr =
        (typeof data?.date === "string" && data.date.length >= 10
          ? (data.date as string).slice(0, 10)
          : null) ?? formatDateForDailyStats(data?.createdAt);
      if (dateStr) {
        addTicketRevenueToDailyStats(tx, companyId, agencyId, dateStr, montant);
      }
    }

    const updatePayload: Record<string, unknown> = {
      statut: newStatut,
      auditLog: arrayUnion(auditEntry),
      updatedAt: serverTimestamp(),
      ...extra,
    };
    if (shouldAddToDailyStats) {
      updatePayload.ticketRevenueCountedInDailyStats = true;
    }

    tx.update(ref, updatePayload);
  });
}

/**
 * Met à jour le statut d'une réservation avec vérification de transition et auditLog.
 * À utiliser pour annulation, remboursement, etc. Ne pas contourner avec updateDoc direct.
 * For confirme/paye, uses a transaction and updates dailyStats (online reservations) once per reservation.
 *
 * @param ref - DocumentReference de la réservation
 * @param newStatut - Nouveau statut (canonique : paye, embarque, annule, rembourse, etc.)
 * @param meta - userId et userRole pour l'audit
 * @param extra - Champs additionnels (annulation, remboursement, updatedAt, etc.)
 */
export async function updateReservationStatut(
  ref: DocumentReference,
  newStatut: string,
  meta: StatutTransitionMeta,
  extra: Record<string, unknown> = {}
): Promise<void> {
  if (REVENUE_STATUTS.has(newStatut)) {
    await transitionToConfirmedOrPaidWithDailyStats(ref, newStatut, meta, extra);
    return;
  }

  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Réservation introuvable.");
  const data = snap.data();
  const oldStatut = (data?.statut ?? "") as string;

  if (!isValidTransition(oldStatut, newStatut)) {
    throw new Error(`Transition non autorisée : ${oldStatut} → ${newStatut}`);
  }

  const auditEntry = buildStatutTransitionPayload(oldStatut, newStatut, meta);

  await updateDoc(ref, {
    statut: newStatut,
    auditLog: arrayUnion(auditEntry),
    updatedAt: serverTimestamp(),
    ...extra,
  });
}
