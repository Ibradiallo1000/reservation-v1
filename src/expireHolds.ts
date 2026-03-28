// Cloud Function (hébergée séparément ou copiée vers functions/) : expiration des holds paiement.
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
  resolveJourneySegmentIndices,
  applySegmentDeltaCapped,
  type TripInstanceSegment,
  type JourneyForSegments,
} from "@/modules/compagnie/tripInstances/tripInstanceSegments";
import {
  type TripInstanceDoc,
  tripInstanceSeatCapacity,
  tripInstanceRemainingFromDoc,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";

const db = admin.firestore();

/** Libère les sièges sur le tripInstance (réservation expirée ou annulée). */
async function decrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number,
  journey?: JourneyForSegments
): Promise<void> {
  if (seats <= 0) return;
  const ref = db.collection("companies").doc(companyId).collection("tripInstances").doc(tripInstanceId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data() as Record<string, unknown>;
    const capacity = tripInstanceSeatCapacity(d as unknown as TripInstanceDoc);
    const reserved = Math.max(0, Number(d.reservedSeats) || 0);
    const delta = Math.min(seats, reserved);
    if (delta <= 0) return;

    const stops = d.stops as string[] | undefined;
    const segmentsRaw = Array.isArray(d.segments) ? (d.segments as TripInstanceSegment[]) : undefined;
    const indices =
      stops && segmentsRaw && segmentsRaw.length > 0
        ? resolveJourneySegmentIndices(stops, segmentsRaw, journey ?? {})
        : null;

    if (indices != null && segmentsRaw && segmentsRaw.length > 0) {
      const newSegs = applySegmentDeltaCapped(segmentsRaw, indices, delta, capacity);
      const newRemainingSeats = Math.min(
        ...newSegs.map((s) => Math.max(0, Number(s.remaining) || 0))
      );
      const newReserved = reserved - delta;
      tx.update(ref, {
        segments: newSegs,
        remainingSeats: newRemainingSeats,
        reservedSeats: newReserved,
        passengerCount: admin.firestore.FieldValue.increment(-delta),
        updatedAt: admin.firestore.Timestamp.now(),
      });
      return;
    }

    const remaining = tripInstanceRemainingFromDoc(d as unknown as TripInstanceDoc);
    const newReserved = reserved - delta;
    const newRemaining = Math.min(capacity, remaining + delta);
    tx.update(ref, {
      reservedSeats: newReserved,
      remainingSeats: newRemaining,
      passengerCount: admin.firestore.FieldValue.increment(-delta),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  });
}

export const expireHolds = functions.pubsub.schedule("every 5 minutes").onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  const companies = await db.collection("companies").get();
  for (const c of companies.docs) {
    const agences = await db.collection("companies").doc(c.id).collection("agences").get();
    for (const a of agences.docs) {
      const resCol = db.collection("companies").doc(c.id).collection("agences").doc(a.id).collection("reservations");
      const snapLegacy = await resCol
        .where("statut", "==", "en_attente_paiement")
        .where("holdUntil", "<", now)
        .get();
      const nowMs = now.toMillis();
      const snapOnlineHold = await resCol
        .where("status", "==", "en_attente")
        .where("canal", "==", "en_ligne")
        .where("expiresAt", "<=", nowMs)
        .get();

      const toExpireByPath = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
      for (const d of snapLegacy.docs) toExpireByPath.set(d.ref.path, d);
      for (const d of snapOnlineHold.docs) toExpireByPath.set(d.ref.path, d);
      const docsToExpire = Array.from(toExpireByPath.values());

      const auditEntry = {
        action: "expiration",
        ancienStatut: "en_attente",
        nouveauStatut: "annulé",
        effectuePar: "system",
        role: "cron",
        date: now,
      };
      const batch = db.batch();
      docsToExpire.forEach((d) => {
        const pathData = d.data() as Record<string, unknown>;
        const usesStatus = pathData.status != null;
        batch.update(d.ref, {
          ...(usesStatus
            ? { status: "annulé" }
            : { statut: "annule" }),
          updatedAt: now,
          auditLog: admin.firestore.FieldValue.arrayUnion(auditEntry),
        });
      });
      if (docsToExpire.length > 0) await batch.commit();

      for (const d of docsToExpire) {
        const data = d.data();
        /** Hold sans écriture sur tripInstance : rien à libérer sur l’instance. */
        if (data.seatHoldOnly === true) continue;
        const tripInstanceId = data.tripInstanceId as string | undefined;
        const seatsGo = Number(data.seatsGo ?? data.seats ?? 1) || 1;
        const seatsReturn = Number(data.seatsReturn ?? 0) || 0;
        const seats = seatsGo + seatsReturn;
        if (tripInstanceId && seats > 0) {
          try {
            await decrementReservedSeats(c.id, tripInstanceId, seats, {
              originStopOrder: data.originStopOrder as number | null | undefined,
              destinationStopOrder: data.destinationStopOrder as number | null | undefined,
              depart: String(data.depart ?? ""),
              arrivee: String(data.arrivee ?? ""),
            });
          } catch (err) {
            console.error("[expireHolds] decrementReservedSeats failed", {
              companyId: c.id,
              tripInstanceId,
              err,
            });
          }
        }
      }
    }
  }
  return null;
});
