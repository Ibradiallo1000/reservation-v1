/**
 * À la réception de preuve (paiement déclaré) :
 * - décrémenter tripInstance une seule fois si la réservation était en hold (seatHoldOnly)
 * - rendre le flux idempotent : si la preuve a déjà été reçue, on renvoie simplement l’état existant
 */

import {
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";
import {
  bookSeatsOnTripInstanceInTransaction,
  tripInstanceRef,
} from "./tripInstanceService";
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
  const paymentStatus = normalizeLooseStatus(
    (data.payment as Record<string, unknown> | undefined)?.status
  );

  const proofMessage =
    typeof data.preuveMessage === "string" ? data.preuveMessage.trim() : "";

  const hasProofTimestamp =
    data.proofSubmittedAt != null || data.proofSubmittedAt === null
      ? data.proofSubmittedAt != null
      : false;

  return (
    reservationStatus === "payé" ||
    reservationStatus === "paye" ||
    reservationStatus === "confirme" ||
    reservationStatus === "confirmed" ||
    paymentStatus === "declared_paid" ||
    paymentStatus === "auto_detected" ||
    paymentStatus === "validated" ||
    proofMessage.length > 0 ||
    hasProofTimestamp
  );
}

export async function commitProofReceivedWithSeatBooking(
  firestore: Firestore,
  reservationRef: DocumentReference,
  reservationUpdates: Record<string, unknown>
): Promise<CommitProofReceivedResult> {
  return runTransaction(firestore, async (tx) => {
    const resSnap = await tx.get(reservationRef);

    if (!resSnap.exists()) {
      throw new Error("Réservation introuvable");
    }

    const data = resSnap.data() as Record<string, unknown>;
    const currentStatus = data.status;

    // Idempotence : si la réservation a déjà reçu une preuve / est déjà passée à un état payé,
    // on ne relance pas le booking ni les écritures inutiles.
    if (!isReservationAwaitingPayment(currentStatus)) {
      if (isAlreadyProofCommitted(data)) {
        return extractCommitResult(resSnap.id, data);
      }
      throw new Error("Cette réservation a expiré ou a déjà été traitée.");
    }

    const companyId = String(data.companyId ?? "");
    const tripInstanceId = String(data.tripInstanceId ?? "");
    const seats = Math.max(0, Number(data.seatsGo) || 0);

    if (data.seatHoldOnly === true && companyId && tripInstanceId && seats > 0) {
      const tiRef = tripInstanceRef(companyId, tripInstanceId);
      const tiSnap = await tx.get(tiRef);

      bookSeatsOnTripInstanceInTransaction(tx, tiRef, tiSnap, seats, {
        originStopOrder:
          data.originStopOrder != null && data.originStopOrder !== ""
            ? Number(data.originStopOrder)
            : undefined,
        destinationStopOrder:
          data.destinationStopOrder != null && data.destinationStopOrder !== ""
            ? Number(data.destinationStopOrder)
            : undefined,
        depart: String(data.depart ?? ""),
        arrivee: String(data.arrivee ?? ""),
      });
    }

    tx.update(reservationRef, {
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
  });
}