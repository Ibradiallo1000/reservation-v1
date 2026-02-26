/**
 * Script one-shot : copie compagnieId → companyId sur les réservations qui n’ont pas companyId.
 *
 * Parcours : companies/{companyId}/agences/{agencyId}/reservations
 * Pour chaque document : si compagnieId présent et companyId absent → update { companyId: compagnieId }.
 *
 * Lancement (à la racine du projet) :
 *   npx ts-node scripts/backfillReservationCompanyId.ts
 *
 * Prérequis : GOOGLE_APPLICATION_CREDENTIALS pointant vers une clé service-account Firebase.
 */

import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const BATCH_SIZE = 500;

async function main() {
  console.log("Backfill reservation companyId: START");

  let totalUpdated = 0;
  let totalAlreadyCorrect = 0;

  const companiesSnap = await db.collection("companies").get();

  let batch = db.batch();
  let batchOpCount = 0;

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const agencesRef = db.collection("companies").doc(companyId).collection("agences");
    const agencesSnap = await agencesRef.get();

    for (const agencyDoc of agencesSnap.docs) {
      const agencyId = agencyDoc.id;
      const reservationsRef = agencesRef.doc(agencyId).collection("reservations");

      let cursor: admin.firestore.DocumentSnapshot | undefined;
      do {
        const q = cursor
          ? reservationsRef.orderBy(admin.firestore.FieldPath.documentId()).startAfter(cursor).limit(BATCH_SIZE)
          : reservationsRef.orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH_SIZE);
        const snap = await q.get();

        for (const doc of snap.docs) {
          const data = doc.data();
          const compagnieId = data.compagnieId;
          const companyIdExisting = data.companyId;

          if (compagnieId != null && compagnieId !== "" && (companyIdExisting === undefined || companyIdExisting === null)) {
            batch.update(doc.ref, { companyId: compagnieId });
            batchOpCount++;
            totalUpdated++;
            if (batchOpCount >= BATCH_SIZE) {
              await batch.commit();
              batch = db.batch();
              batchOpCount = 0;
            }
          } else if (companyIdExisting !== undefined && companyIdExisting !== null) {
            totalAlreadyCorrect++;
          }
        }

        cursor = snap.docs.length === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : undefined;
      } while (cursor);
    }
  }

  if (batchOpCount > 0) {
    await batch.commit();
  }

  console.log("Backfill reservation companyId: DONE");
  console.log("Documents mis à jour (companyId ajouté):", totalUpdated);
  console.log("Documents déjà corrects (companyId présent):", totalAlreadyCorrect);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
