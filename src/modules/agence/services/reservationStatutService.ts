/**
 * Phase B — Point d'entrée unique pour toute transition de statut réservation.
 * Ne pas faire updateDoc direct sur le champ statut : utiliser ce service pour garantir auditLog.
 */

import {
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { isValidTransition } from "@/utils/reservationStatusUtils";

export type StatutTransitionMeta = {
  userId: string;
  userRole: string;
};

/** Entrée à pousser dans auditLog (arrayUnion). */
export type AuditLogEntry = {
  action: "transition_statut";
  ancienStatut: string;
  nouveauStatut: string;
  effectuePar: string;
  role: string;
  date: ReturnType<typeof serverTimestamp>;
};

/**
 * Construit l'entrée auditLog pour une transition (à merger avec arrayUnion dans un update).
 * À utiliser dans un runTransaction ou updateDoc.
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
    date: serverTimestamp(),
  };
}

/**
 * Met à jour le statut d'une réservation avec vérification de transition et auditLog.
 * À utiliser pour annulation, remboursement, etc. Ne pas contourner avec updateDoc direct.
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
