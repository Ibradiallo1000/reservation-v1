// functions/src/expireHolds.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
const db = admin.firestore();

export const expireHolds = functions.pubsub.schedule('every 5 minutes').onRun(async () => {
  const now = admin.firestore.Timestamp.now();
  // ⚠️ Firestore ne permet pas les requêtes cross-collection facilement.
  // Stratégie: on parcourt companies -> agences (suffisant si volume raisonnable).
  const companies = await db.collection('companies').get();
  for (const c of companies.docs) {
    const agences = await db.collection('companies').doc(c.id).collection('agences').get();
    for (const a of agences.docs) {
      const resCol = db.collection('companies').doc(c.id).collection('agences').doc(a.id).collection('reservations');
      const snap = await resCol
        .where('statut','==','en_attente_paiement')
        .where('holdUntil','<', now)
        .get();
      const batch = db.batch();
      snap.forEach(d => batch.update(d.ref, { statut: 'annulé', updatedAt: now }));
      if (!snap.empty) await batch.commit();
    }
  }
  return null;
});
