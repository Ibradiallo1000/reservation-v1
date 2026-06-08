import {
  arrayUnion,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { buildStatutTransitionPayload } from "@/modules/agence/services/reservationStatutService";
import {
  bookSeatsOnTripInstanceInTransaction,
  tripInstanceRef,
} from "./tripInstanceService";

type OperatorCommitParams = {
  reservationRef: DocumentReference;
  companyId: string;
  paymentId: string;
  uid: string;
  userRole: string;
};

const PENDING_ONLINE_STATUSES = new Set(["preuve_recue", "verification"]);

export async function commitOperatorValidatedOnlineReservation({
  reservationRef,
  companyId,
  paymentId,
  uid,
  userRole,
}: OperatorCommitParams): Promise<void> {
  await runTransaction(db, async (tx) => {
    const paymentRef = doc(db, "companies", companyId, "payments", paymentId);
    const [reservationSnap, paymentSnap] = await Promise.all([
      tx.get(reservationRef),
      tx.get(paymentRef),
    ]);

    if (!reservationSnap.exists()) throw new Error("Réservation introuvable.");
    if (!paymentSnap.exists()) throw new Error("Paiement introuvable.");

    const reservation = reservationSnap.data() as Record<string, unknown>;
    const payment = paymentSnap.data() as Record<string, unknown>;
    const reservationCompanyId = String(reservation.companyId ?? "");
    const channel = String(reservation.paymentChannel ?? reservation.canal ?? "").toLowerCase();
    const status = String(reservation.status ?? "").toLowerCase();
    const statut = String(reservation.statut ?? "").toLowerCase();

    if (reservationCompanyId !== companyId) {
      throw new Error("La réservation ne correspond pas à la compagnie du paiement.");
    }
    if (channel !== "online" && channel !== "en_ligne") {
      throw new Error("La réservation n'est pas une réservation online.");
    }
    if (String(payment.status ?? "") !== "validated") {
      throw new Error("Le paiement doit être validé avant la confirmation de la réservation.");
    }

    if (status === "confirme" && statut === "confirme" && reservation.seatsCommittedAt != null) {
      return;
    }
    if (!PENDING_ONLINE_STATUSES.has(status) && !PENDING_ONLINE_STATUSES.has(statut)) {
      throw new Error(`Réservation non confirmable : status=${status}, statut=${statut}.`);
    }

    const seatHoldOnly = reservation.seatHoldOnly === true;
    const seatsAlreadyCommitted = reservation.seatsCommittedAt != null;
    if (seatHoldOnly && !seatsAlreadyCommitted) {
      const tripInstanceId = String(reservation.tripInstanceId ?? "").trim();
      const heldSeats = Number(reservation.seatsHeld ?? 0) || 0;
      const seats = Math.max(
        0,
        heldSeats > 0 ? heldSeats : Number(reservation.seatsGo ?? 0) || 0
      );
      if (!tripInstanceId || seats <= 0) {
        throw new Error("Impossible de confirmer les sièges : trajet ou nombre de sièges manquant.");
      }

      const tiRef = tripInstanceRef(companyId, tripInstanceId);
      const tiSnap = await tx.get(tiRef);
      bookSeatsOnTripInstanceInTransaction(tx, tiRef, tiSnap, seats, {
        originStopOrder:
          reservation.originStopOrder != null ? Number(reservation.originStopOrder) : undefined,
        destinationStopOrder:
          reservation.destinationStopOrder != null
            ? Number(reservation.destinationStopOrder)
            : undefined,
        depart: String(reservation.depart ?? ""),
        arrivee: String(reservation.arrivee ?? ""),
      });
    }

    const existingPayment =
      typeof reservation.payment === "object" && reservation.payment !== null
        ? (reservation.payment as Record<string, unknown>)
        : {};
    const auditEntry = buildStatutTransitionPayload(
      PENDING_ONLINE_STATUSES.has(statut) ? statut : status,
      "confirme",
      { userId: uid, userRole }
    );

    tx.update(reservationRef, {
      status: "confirme",
      statut: "confirme",
      paymentStatus: "paid",
      payment: {
        ...existingPayment,
        status: "validated",
      },
      ticketValidatedAt: serverTimestamp(),
      validatedBy: uid,
      auditLog: arrayUnion(auditEntry),
      seatHoldOnly: false,
      seatsHeld: 0,
      ...(!seatsAlreadyCommitted && { seatsCommittedAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    });
  });
}
