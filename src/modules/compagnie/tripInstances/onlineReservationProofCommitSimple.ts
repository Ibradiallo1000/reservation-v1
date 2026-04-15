// src/modules/compagnie/tripInstances/onlineReservationProofCommitSimple.ts

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import { isReservationAwaitingPayment } from "@/modules/compagnie/public/utils/onlineReservationStatus";

export type CommitProofReceivedResult = {
  publicToken: string | null;
  companyId: string | null;
  agencyId: string | null;
  reservationId: string;
  amount: number;
};

function normalizeLooseStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function extractCommitResult(
  reservationId: string,
  data: Record<string, unknown>
): CommitProofReceivedResult {
  const publicToken = typeof data.publicToken === "string" ? data.publicToken : null;
  const companyId = typeof data.companyId === "string" ? data.companyId : null;
  const agencyId = typeof data.agencyId === "string" ? data.agencyId : null;
  const amount =
    Number(
      (data.payment as { totalAmount?: unknown } | undefined)?.totalAmount ??
        data.montant ??
        0
    ) || 0;

  return {
    publicToken,
    companyId,
    agencyId,
    reservationId,
    amount,
  };
}

function isAlreadyProofCommitted(data: Record<string, unknown>): boolean {
  const reservationStatus = normalizeLooseStatus(data.status);
  
  const proofMessage =
    typeof data.preuveMessage === "string" ? data.preuveMessage.trim() : "";

  return (
    reservationStatus === "payé" ||
    reservationStatus === "paye" ||
    reservationStatus === "confirme" ||
    reservationStatus === "confirmed" ||
    proofMessage.length > 0
  );
}

/**
 * Version SIMPLE sans transaction - Évite complètement les rate limits
 * Utilise des updates Firestore basiques au lieu de transactions lourdes
 */
export async function commitProofSimple(
  firestore: Firestore,
  reservationRef: DocumentReference,
  reservationUpdates: Record<string, unknown>
): Promise<CommitProofReceivedResult> {
  // Attendre un peu pour éviter les conflits
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Lire la réservation
  const resSnap = await getDoc(reservationRef);
  
  if (!resSnap.exists()) {
    throw new Error("Réservation introuvable");
  }
  
  const data = resSnap.data() as Record<string, unknown>;
  const currentStatus = data.status;
  
  // Vérifier si déjà traité
  if (!isReservationAwaitingPayment(currentStatus)) {
    if (isAlreadyProofCommitted(data)) {
      return extractCommitResult(resSnap.id, data);
    }
    throw new Error("Cette réservation a expiré ou a déjà été traitée.");
  }
  
  // Mise à jour simple SANS transaction
  await updateDoc(reservationRef, {
    ...reservationUpdates,
    seatHoldOnly: false,
    seatsHeld: 0,
    updatedAt: serverTimestamp(),
  });
  
  return extractCommitResult(resSnap.id, {
    ...data,
    ...reservationUpdates,
    seatHoldOnly: false,
    seatsHeld: 0,
  });
}