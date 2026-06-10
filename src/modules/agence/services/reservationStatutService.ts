/**
 * Phase B — Point d'entrée unique pour toute transition de statut réservation.
 * Ne pas faire updateDoc direct sur le champ statut : utiliser ce service pour garantir auditLog.
 * When transitioning to confirme/paye, dailyStats.ticketRevenue is updated for en_ligne reservations (once per reservation).
 */

import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  runTransaction,
  type DocumentReference,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { isValidTransition } from "@/utils/reservationStatusUtils";
import {
  addTicketRevenueToDailyStats,
  formatDateForDailyStats,
  dailyStatsTimezoneFromAgencyData,
} from "@/modules/agence/aggregates/dailyStats";
import {
  activityLogRef,
  activityLogDocIdOnline,
  writeOnlineTicketActivityInTransaction,
} from "@/modules/compagnie/activity/activityLogsService";

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

export function recordOnlineReservationCommercialActivityInTransaction(params: {
  tx: Transaction;
  reservationRef: DocumentReference;
  data: Record<string, unknown>;
  agencyTimezone: string;
  activityLogExists: boolean;
}): { ticketRevenueCountedInDailyStats?: true } {
  const { tx, reservationRef, data, agencyTimezone, activityLogExists } = params;
  const companyId = String(data.companyId ?? "").trim();
  const agencyId = String(data.agencyId ?? "").trim();
  const canal = String(data.canal ?? "").trim().toLowerCase();
  const paymentChannel = String(data.paymentChannel ?? "").trim().toLowerCase();
  const isOnline =
    canal === "en_ligne" ||
    canal === "online" ||
    paymentChannel === "en_ligne" ||
    paymentChannel === "online";
  const amount = Number(data.montant ?? 0);

  if (!isOnline || !companyId || !agencyId || amount <= 0) return {};

  const updatePayload: { ticketRevenueCountedInDailyStats?: true } = {};
  if (!Boolean(data.ticketRevenueCountedInDailyStats)) {
    const dateStr =
      (typeof data.date === "string" && data.date.length >= 10 ? data.date.slice(0, 10) : null) ??
      formatDateForDailyStats(data.createdAt, agencyTimezone);
    addTicketRevenueToDailyStats(tx, companyId, agencyId, dateStr, amount, agencyTimezone);
    updatePayload.ticketRevenueCountedInDailyStats = true;
  }

  if (!activityLogExists) {
    const seats = Number(data.seatsGo ?? 0) + Number(data.seatsReturn ?? 0);
    writeOnlineTicketActivityInTransaction(tx, {
      companyId,
      agencyId,
      reservationId: reservationRef.id,
      amount,
      seats: Math.max(1, seats || 1),
      depart: String(data.depart ?? "").trim() || undefined,
      arrivee: String(data.arrivee ?? "").trim() || undefined,
    });
  }

  return updatePayload;
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

  const plannedWrites: Array<{ target: string; path: string; payloadKeys: string[] }> = [];
  const logWriteAttempt = (
    target: string,
    path: string,
    payload: Record<string, unknown>,
    companyId: string,
    agencyId: string
  ) => {
    const payloadKeys = Object.keys(payload);
    plannedWrites.push({ target, path, payloadKeys });
    console.warn("[ONLINE_PAYMENT_TRANSITION_WRITE_ATTEMPT]", {
      target,
      path,
      payloadKeys,
      payload,
      companyId,
      agencyId,
      reservationId: ref.id,
      uid: meta.userId,
    });
  };

  try {
    await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Réservation introuvable.");
    const data = snap.data() as Record<string, unknown>;
    const companyIdEarly = (data?.companyId ?? "") as string;
    const agencyIdEarly = (data?.agencyId ?? "") as string;
    const agencyRef =
      companyIdEarly && agencyIdEarly ? doc(db, "companies", companyIdEarly, "agences", agencyIdEarly) : null;
    const agencySnap = agencyRef ? await tx.get(agencyRef) : null;
    const agencyTz = dailyStatsTimezoneFromAgencyData(
      agencySnap?.data() as { timezone?: string } | undefined
    );
    const lifecycleStatus = data?.status as string | undefined;
    const ticketValidatedAt = data?.ticketValidatedAt;
    const oldStatut = (data?.statut ?? "") as string;

    /** Modèle SaaS : status en_attente | payé | annulé — validation billet = payé + ticketValidatedAt */
    const isLifecycleModel =
      lifecycleStatus === "en_attente" || lifecycleStatus === "payé" || lifecycleStatus === "annulé";

    if (isLifecycleModel && newStatut === "confirme") {
      if (lifecycleStatus !== "payé" || ticketValidatedAt != null) {
        throw new Error("Cette réservation ne peut plus être confirmée.");
      }
    } else if (!isLifecycleModel && !isValidTransition(oldStatut, newStatut)) {
      throw new Error(`Transition non autorisée : ${oldStatut} → ${newStatut}`);
    }

    const auditOld = isLifecycleModel ? String(lifecycleStatus ?? "") : oldStatut;
    const auditEntry = buildStatutTransitionPayload(auditOld, newStatut, meta);
    const companyId = companyIdEarly;
    const agencyId = agencyIdEarly;
    const montant = Number(data?.montant ?? 0);

    const isGuichetSale =
      String(data?.canal ?? "").toLowerCase() === "guichet" ||
      String(data?.paymentChannel ?? "").toLowerCase() === "guichet";
    /* Toutes les lectures avant toute écriture (Firestore : reads puis writes uniquement). */
    const onlineLogRef = companyId ? activityLogRef(companyId, activityLogDocIdOnline(ref.id)) : null;
    const onlineLogSnap =
      onlineLogRef && !isGuichetSale && montant > 0 ? await tx.get(onlineLogRef) : null;
    const commercialActivityPatch = recordOnlineReservationCommercialActivityInTransaction({
      tx,
      reservationRef: ref,
      data,
      agencyTimezone: agencyTz,
      activityLogExists: onlineLogSnap?.exists() ?? false,
    });

    const updatePayload: Record<string, unknown> = {
      ...(isLifecycleModel
        ? {
            status: "payé",
            ticketValidatedAt: serverTimestamp(),
          }
        : { statut: newStatut }),
      auditLog: arrayUnion(auditEntry),
      updatedAt: serverTimestamp(),
      ...extra,
      ...commercialActivityPatch,
    };

    try {
      logWriteAttempt("reservation", ref.path, updatePayload, companyId, agencyId);
      tx.update(ref, updatePayload);
    } catch (error) {
      console.error("[ONLINE_PAYMENT_TRANSITION_WRITE_FAILED]", {
        target: "reservation",
        path: ref.path,
        payloadKeys: Object.keys(updatePayload),
        error,
      });
      throw error;
    }
    });
  } catch (error) {
    console.error("[ONLINE_PAYMENT_TRANSITION_WRITE_FAILED]", {
      target: "transaction_commit_or_read",
      path: ref.path,
      payloadKeys: plannedWrites.flatMap((write) => write.payloadKeys),
      plannedWrites,
      error,
    });
    throw error;
  }
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
