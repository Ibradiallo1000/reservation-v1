/**
 * À la réception de preuve (paiement déclaré) : décrémenter tripInstance une seule fois
 * si la réservation était en hold (seatHoldOnly).
 */

import { runTransaction, serverTimestamp, type DocumentReference, type Firestore } from "firebase/firestore";
import { bookSeatsOnTripInstanceInTransaction, tripInstanceRef } from "./tripInstanceService";
import { isReservationAwaitingPayment } from "@/modules/compagnie/public/utils/onlineReservationStatus";

export type CommitProofReceivedResult = {
  publicToken: string | null;
  companyId: string | null;
  agencyId: string | null;
  reservationId: string;
  amount: number;
};

export async function commitProofReceivedWithSeatBooking(
  firestore: Firestore,
  reservationRef: DocumentReference,
  reservationUpdates: Record<string, unknown>
): Promise<CommitProofReceivedResult> {
  return runTransaction(firestore, async (tx) => {
    const resSnap = await tx.get(reservationRef);
    if (!resSnap.exists()) throw new Error("Réservation introuvable");
    const data = resSnap.data() as Record<string, unknown>;
    if (!isReservationAwaitingPayment(data.status)) {
      throw new Error("Cette réservation a expiré ou a déjà été traitée.");
    }
    const cid = String(data.companyId ?? "");
    const tid = String(data.tripInstanceId ?? "");
    const publicToken = typeof data.publicToken === "string" ? data.publicToken : null;
    const agencyId = typeof data.agencyId === "string" ? data.agencyId : null;
    const amount = Number((data.payment as { totalAmount?: unknown } | undefined)?.totalAmount ?? data.montant ?? 0) || 0;
    if (data.seatHoldOnly === true && cid && tid) {
      const seats = Math.max(0, Number(data.seatsGo) || 0);
      if (seats > 0) {
        const tiRef = tripInstanceRef(cid, tid);
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
    }
    tx.update(reservationRef, {
      ...reservationUpdates,
      seatHoldOnly: false,
      seatsHeld: 0,
      updatedAt: serverTimestamp(),
    });
    return {
      publicToken,
      companyId: cid || null,
      agencyId,
      reservationId: resSnap.id,
      amount,
    };
  });
}
