// functions/src/expireHolds.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
const db = admin.firestore();

/** Libère les sièges sur le tripInstance (réservation expirée ou annulée). */
async function decrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number
): Promise<void> {
  if (seats <= 0) return;
  const ref = db.collection('companies').doc(companyId).collection('tripInstances').doc(tripInstanceId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const d = snap.data() as { reservedSeats?: number };
    const current = d?.reservedSeats ?? 0;
    const delta = Math.min(seats, current);
    if (delta <= 0) return;
    tx.update(ref, {
      reservedSeats: admin.firestore.FieldValue.increment(-delta),
      passengerCount: admin.firestore.FieldValue.increment(-delta),
      updatedAt: admin.firestore.Timestamp.now(),
    });
  });
}

export const expireHolds = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  const companies = await db.collection('companies').get();
  for (const c of companies.docs) {
    const agences = await db.collection('companies').doc(c.id).collection('agences').get();
    for (const a of agences.docs) {
      const resCol = db.collection('companies').doc(c.id).collection('agences').doc(a.id).collection('reservations');
      const snap = await resCol
        .where('statut', '==', 'en_attente_paiement')
        .where('holdUntil', '<', now)
        .get();
      const auditEntry = {
        action: 'expiration',
        ancienStatut: 'en_attente_paiement',
        nouveauStatut: 'annule',
        effectuePar: 'system',
        role: 'cron',
        date: now,
      };
      const batch = db.batch();
      snap.docs.forEach((d) =>
        batch.update(d.ref, {
          statut: 'annule',
          updatedAt: now,
          auditLog: admin.firestore.FieldValue.arrayUnion(auditEntry),
        })
      );
      if (!snap.empty) await batch.commit();

      for (const d of snap.docs) {
        const data = d.data();
        const tripInstanceId = data.tripInstanceId as string | undefined;
        const seatsGo = Number(data.seatsGo ?? data.seats ?? 1) || 1;
        const seatsReturn = Number(data.seatsReturn ?? 0) || 0;
        const seats = seatsGo + seatsReturn;
        if (tripInstanceId && seats > 0) {
          try {
            await decrementReservedSeats(c.id, tripInstanceId, seats);
          } catch (err) {
            console.error('[expireHolds] decrementReservedSeats failed', { companyId: c.id, tripInstanceId, err });
          }
        }
      }
    }
  }
  return null;
});
