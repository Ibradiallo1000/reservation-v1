import {
  arrayUnion,
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  buildStatutTransitionPayload,
  recordOnlineReservationCommercialActivityInTransaction,
} from "@/modules/agence/services/reservationStatutService";
import {
  activityLogDocIdOnline,
  activityLogRef,
} from "@/modules/compagnie/activity/activityLogsService";
import { dailyStatsTimezoneFromAgencyData } from "@/modules/agence/aggregates/dailyStats";
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

function hasOwnField(data: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(data, key);
}

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
    const agencyId = String(reservation.agencyId ?? "").trim();
    const channel = String(reservation.paymentChannel ?? reservation.canal ?? "").toLowerCase();
    const status = String(reservation.status ?? "").toLowerCase();
    const statut = String(reservation.statut ?? "").toLowerCase();
    let publicToken = String(reservation.publicToken ?? payment.publicToken ?? "").trim();
    if (!publicToken) {
      const publicPointerSnap = await tx.get(doc(db, "publicReservations", reservationRef.id));
      const publicPointer = publicPointerSnap.data() as Record<string, unknown> | undefined;
      publicToken = String(publicPointer?.token ?? publicPointer?.publicToken ?? "").trim();
    }

    if (reservationCompanyId !== companyId) {
      throw new Error("La réservation ne correspond pas à la compagnie du paiement.");
    }
    if (!agencyId) {
      throw new Error("La reservation online n'est rattachee a aucune agence.");
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
    const agencySnap = await tx.get(doc(db, "companies", companyId, "agences", agencyId));
    const onlineLogSnap = await tx.get(
      activityLogRef(companyId, activityLogDocIdOnline(reservationRef.id))
    );
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
    const existingReservation =
      typeof reservation.reservation === "object" && reservation.reservation !== null
        ? (reservation.reservation as Record<string, unknown>)
        : {};
    const currentBoardingStatus = String(reservation.boardingStatus ?? "").toLowerCase();
    const currentStatutEmbarquement = String(reservation.statutEmbarquement ?? "").toLowerCase();
    const alreadyBoardingProcessed =
      currentBoardingStatus === "boarded" ||
      currentBoardingStatus === "checked_in" ||
      currentStatutEmbarquement === "embarqué" ||
      currentStatutEmbarquement === "embarque" ||
      reservation.checkInTime != null ||
      reservation.controleurId != null;
    const boardingDefaultsPatch: Record<string, unknown> = {};
    if (!alreadyBoardingProcessed) {
      if (!hasOwnField(reservation, "boardingStatus")) {
        boardingDefaultsPatch.boardingStatus = "pending";
      }
      if (!hasOwnField(reservation, "statutEmbarquement")) {
        boardingDefaultsPatch.statutEmbarquement = "en_attente";
      }
      if (!hasOwnField(reservation, "checkInTime")) {
        boardingDefaultsPatch.checkInTime = null;
      }
      if (!hasOwnField(reservation, "controleurId")) {
        boardingDefaultsPatch.controleurId = null;
      }
    }
    const auditEntry = buildStatutTransitionPayload(
      PENDING_ONLINE_STATUSES.has(statut) ? statut : status,
      "confirme",
      { userId: uid, userRole }
    );
    const commercialActivityPatch = recordOnlineReservationCommercialActivityInTransaction({
      tx,
      reservationRef,
      data: reservation,
      agencyTimezone: dailyStatsTimezoneFromAgencyData(
        agencySnap.data() as { timezone?: string | null } | undefined
      ),
      activityLogExists: onlineLogSnap.exists(),
    });

    tx.update(reservationRef, {
      status: "confirme",
      statut: "confirme",
      paymentStatus: "paid",
      payment: {
        ...existingPayment,
        status: "validated",
      },
      reservation: {
        ...existingReservation,
        status: "confirme",
      },
      ...boardingDefaultsPatch,
      ticketValidatedAt: serverTimestamp(),
      validatedBy: uid,
      auditLog: arrayUnion(auditEntry),
      seatHoldOnly: false,
      seatsHeld: 0,
      ...(!seatsAlreadyCommitted && { seatsCommittedAt: serverTimestamp() }),
      ...commercialActivityPatch,
      updatedAt: serverTimestamp(),
    });

    console.log("[PUBLIC SYNC TOKEN]", publicToken);
    if (publicToken) {
      console.log("[PUBLIC SYNC PATH]", `publicReservations/${publicToken}`);
      tx.set(
        doc(db, "publicReservations", publicToken),
        {
          status: "confirme",
          statut: "confirme",
          paymentStatus: "paid",
          payment: {
            status: "validated",
          },
          ticketValidatedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  });
}
