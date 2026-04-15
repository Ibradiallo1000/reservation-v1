/**
 * Phase B — Point d'entrée unique pour toute transition de statut réservation.
 * 🔥 VERSION SIMPLIFIÉE SANS TRANSACTION - ÉVITE LES 429
 */

import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { isValidTransition } from "@/utils/reservationStatusUtils";
import {
  addTicketRevenueToDailyStats,
  formatDateForDailyStats,
  dailyStatsTimezoneFromAgencyData,
} from "@/modules/agence/aggregates/dailyStats";

export type StatutTransitionMeta = {
  userId: string;
  userRole: string;
};

/** Statuts that count as "revenue" for dailyStats */
const REVENUE_STATUTS = new Set(["confirme", "paye"]);

/** Délais de retry exponentiels */
const RETRY_DELAYS = [1000, 2000, 4000];
const MAX_RETRIES = 3;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Exécute une fonction avec retry automatique sur erreur 429
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  retryCount = 0,
  maxRetries = MAX_RETRIES
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = 
      error?.code === 'resource-exhausted' || 
      error?.status === 429 || 
      error?.message?.includes('Too Many Requests') ||
      error?.message?.includes('Quota exceeded');
    
    if (isRateLimit && retryCount < maxRetries) {
      const delayMs = RETRY_DELAYS[retryCount];
      console.log(`[updateReservationStatut] Rate limit, retry ${retryCount + 1}/${maxRetries} dans ${delayMs}ms`);
      await delay(delayMs);
      return withRetry(fn, retryCount + 1, maxRetries);
    }
    throw error;
  }
}

export type AuditLogEntry = {
  action: "transition_statut";
  ancienStatut: string;
  nouveauStatut: string;
  effectuePar: string;
  role: string;
  date: Timestamp;
};

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
 * Version simplifiée pour toutes les transitions
 * 🔥 SUPPRESSION DU PARAMÈTRE TRANSACTION (non utilisé)
 */
export async function updateReservationStatut(
  ref: DocumentReference, 
  newStatut: string, 
  meta: StatutTransitionMeta, 
  extra: Record<string, unknown> = {}
): Promise<void> {
  await delay(300);
  
  await withRetry(async () => {
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
  });
}

/**
 * Version spécifique pour confirme/paye (compatible avec l'ancienne API)
 * 🔥 SUPPRESSION DU PARAMÈTRE TRANSACTION (non utilisé)
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

  await delay(300);
  
  await withRetry(async () => {
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Réservation introuvable.");
    const data = snap.data();
    const oldStatut = (data?.statut ?? "") as string;
    const lifecycleStatus = data?.status as string | undefined;
    const ticketValidatedAt = data?.ticketValidatedAt;
    const companyId = (data?.companyId ?? "") as string;
    const agencyId = (data?.agencyId ?? "") as string;
    const montant = Number(data?.montant ?? 0);
    const alreadyCounted = Boolean(data?.ticketRevenueCountedInDailyStats);
    const canal = ((data?.canal ?? "") as string).toLowerCase();

    const isLifecycleModel = lifecycleStatus === "en_attente" || lifecycleStatus === "payé" || lifecycleStatus === "annulé";
    
    if (isLifecycleModel && newStatut === "confirme") {
      if (lifecycleStatus !== "payé" || ticketValidatedAt != null) {
        throw new Error("Cette réservation ne peut plus être confirmée.");
      }
    } else if (!isLifecycleModel && !isValidTransition(oldStatut, newStatut)) {
      throw new Error(`Transition non autorisée : ${oldStatut} → ${newStatut}`);
    }

    const auditEntry = buildStatutTransitionPayload(
      isLifecycleModel ? String(lifecycleStatus ?? "") : oldStatut, 
      newStatut, 
      meta
    );

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
    };

    if (!alreadyCounted && canal !== "guichet" && montant > 0 && companyId && agencyId) {
      updatePayload.ticketRevenueCountedInDailyStats = true;
      
      // Mettre à jour dailyStats en arrière-plan
      try {
        const agencyTz = "Africa/Abidjan";
        const dateStr = formatDateForDailyStats(data?.createdAt, agencyTz);
        if (dateStr) {
          const dailyStatsRef = doc(db, "companies", companyId, "agences", agencyId, "dailyStats", dateStr);
          const dailySnap = await getDoc(dailyStatsRef);
          
          if (dailySnap.exists()) {
            await updateDoc(dailyStatsRef, {
              ticketRevenue: (dailySnap.data()?.ticketRevenue || 0) + montant,
              totalRevenue: (dailySnap.data()?.totalRevenue || 0) + montant,
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(dailyStatsRef, {
              ticketRevenue: montant,
              totalRevenue: montant,
              date: dateStr,
              agencyId,
              companyId,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (e) {
        console.warn("Erreur mise à jour dailyStats (non bloquante)", e);
      }
    }

    await updateDoc(ref, updatePayload);
  });
}