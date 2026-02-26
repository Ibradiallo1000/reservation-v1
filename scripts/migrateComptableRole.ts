/**
 * Migration: Normalize legacy role "comptable" to canonical roles.
 *
 * 1) users/: For each doc where role == "comptable"
 *    - If agencyId exists → update role to "agency_accountant"
 *    - Else → update role to "company_accountant"
 *
 * 2) companies/{companyId}/agences/{agencyId}/users: For each doc where role == "comptable"
 *    - Update role to "agency_accountant" (always agency-scoped)
 *
 * DO NOT delete data. DO NOT change other fields.
 *
 * Run: npx ts-node scripts/migrateComptableRole.ts
 * Prerequisites: GOOGLE_APPLICATION_CREDENTIALS pointing to service account key
 */

import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const BATCH_SIZE = 500;

async function migrateUsersCollection() {
  const usersRef = db.collection("users");
  const snap = await usersRef.where("role", "==", "comptable").get();

  console.log(`  users/: Found ${snap.size} doc(s) with role "comptable"`);

  let batch = db.batch();
  let count = 0;
  let toAgency = 0;
  let toCompany = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const agencyId = data.agencyId;
    const newRole = agencyId ? "agency_accountant" : "company_accountant";

    batch.update(doc.ref, { role: newRole });
    count++;
    if (agencyId) toAgency++;
    else toCompany++;

    if (count % BATCH_SIZE === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  if (count % BATCH_SIZE !== 0) {
    await batch.commit();
  }

  return { count, toAgency, toCompany };
}

async function migrateAgencySubcollections() {
  const companiesSnap = await db.collection("companies").get();
  let total = 0;

  for (const companyDoc of companiesSnap.docs) {
    const agencesSnap = await companyDoc.ref.collection("agences").get();

    for (const agenceDoc of agencesSnap.docs) {
      const usersSnap = await agenceDoc.ref
        .collection("users")
        .where("role", "==", "comptable")
        .get();

      if (usersSnap.empty) continue;

      const batch = db.batch();
      for (const userDoc of usersSnap.docs) {
        batch.update(userDoc.ref, { role: "agency_accountant" });
        total++;
      }
      await batch.commit();
    }
  }

  return total;
}

async function main() {
  console.log("Migration comptable → agency_accountant / company_accountant: START\n");

  const r1 = await migrateUsersCollection();
  console.log(`  users/: ${r1.count} updated (agency: ${r1.toAgency}, company: ${r1.toCompany})\n`);

  console.log("  companies/.../agences/.../users/: scanning...");
  const r2 = await migrateAgencySubcollections();
  console.log(`  companies/.../agences/.../users/: ${r2} updated\n`);

  console.log("Migration complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
