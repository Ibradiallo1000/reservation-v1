/**
 * One-time admin script: copy compagnieId → companyId on reservations that have
 * compagnieId but no companyId.
 *
 * Path: companies/{companyId}/agences/{agencyId}/reservations
 * Rule: if compagnieId present and companyId absent → update { companyId: compagnieId }.
 * No other fields are modified.
 *
 * Run from project root:
 *   npx ts-node scripts/oneTimeBackfillReservationCompanyId.ts
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS pointing to a Firebase service account key.
 */

import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const BATCH_SIZE = 500;

async function main() {
  console.log("One-time backfill reservation companyId: START");

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
          ? reservationsRef
              .orderBy(admin.firestore.FieldPath.documentId())
              .startAfter(cursor)
              .limit(BATCH_SIZE)
          : reservationsRef
              .orderBy(admin.firestore.FieldPath.documentId())
              .limit(BATCH_SIZE);
        const snap = await q.get();

        for (const doc of snap.docs) {
          const data = doc.data();
          const compagnieId = data.compagnieId;
          const hasCompanyId =
            data.companyId !== undefined && data.companyId !== null && data.companyId !== "";

          if (compagnieId != null && compagnieId !== "" && !hasCompanyId) {
            batch.update(doc.ref, { companyId: compagnieId });
            batchOpCount++;
            totalUpdated++;
            if (batchOpCount >= BATCH_SIZE) {
              await batch.commit();
              batch = db.batch();
              batchOpCount = 0;
            }
          } else if (hasCompanyId) {
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

  console.log("One-time backfill reservation companyId: DONE");
  console.log("Documents updated (companyId set from compagnieId):", totalUpdated);
  console.log("Documents already correct (companyId present):", totalAlreadyCorrect);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
