/**
 * Phase 4.5 — Initialise liveStatus sur les tripAssignments qui n’en ont pas.
 *
 * Pour chaque affectation planned|validated sans liveStatus :
 *   liveStatus = { boardedCount: 0, expectedCount, status: "waiting" }
 * expectedCount = somme des seatsGo des réservations embarquables sur le créneau (même logique que le client).
 *
 * Lancement (racine du projet) :
 *   npx ts-node scripts/migrateTripAssignmentLiveStatus.ts
 *
 * Prérequis : GOOGLE_APPLICATION_CREDENTIALS (service account Firebase).
 */

import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

const BATCH_SIZE = 400;
const STATUTS_EMBARQUABLES = ["confirme", "paye", "payé", "embarque", "embarqué", "validé"] as const;

async function countExpectedReservationsForTripSlot(
  companyId: string,
  agencyId: string,
  tripId: string,
  date: string,
  heure: string
): Promise<number> {
  const heureNorm = String(heure ?? "").trim();
  const reservationsRef = db
    .collection("companies")
    .doc(companyId)
    .collection("agences")
    .doc(agencyId)
    .collection("reservations");

  const weeklySnap = await db
    .collection("companies")
    .doc(companyId)
    .collection("agences")
    .doc(agencyId)
    .collection("weeklyTrips")
    .doc(tripId)
    .get();

  const dep = weeklySnap.exists
    ? String((weeklySnap.data() as { departure?: string }).departure ?? "").trim()
    : "";
  const arr = weeklySnap.exists
    ? String((weeklySnap.data() as { arrival?: string }).arrival ?? "").trim()
    : "";

  const seen = new Set<string>();
  let total = 0;

  const addDocs = (docs: admin.firestore.QueryDocumentSnapshot[]) => {
    for (const d of docs) {
      if (seen.has(d.id)) continue;
      seen.add(d.id);
      const seats = Number((d.data() as { seatsGo?: number }).seatsGo) || 1;
      total += seats;
    }
  };

  if (dep && arr) {
    const q1 = await reservationsRef
      .where("date", "==", date)
      .where("depart", "==", dep)
      .where("arrivee", "==", arr)
      .where("heure", "==", heureNorm)
      .where("statut", "in", [...STATUTS_EMBARQUABLES])
      .limit(500)
      .get();
    addDocs(q1.docs);
  }

  const q2 = await reservationsRef
    .where("date", "==", date)
    .where("trajetId", "==", tripId)
    .where("heure", "==", heureNorm)
    .where("statut", "in", [...STATUTS_EMBARQUABLES])
    .limit(500)
    .get();
  addDocs(q2.docs);

  return total;
}

async function main() {
  console.log("migrateTripAssignmentLiveStatus: START");

  let updated = 0;
  let skippedHasLive = 0;
  let skippedStatus = 0;

  const companiesSnap = await db.collection("companies").get();
  let batch = db.batch();
  let batchCount = 0;

  const commitBatch = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = db.batch();
    batchCount = 0;
  };

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const agencesSnap = await db.collection("companies").doc(companyId).collection("agences").get();

    for (const agencyDoc of agencesSnap.docs) {
      const agencyId = agencyDoc.id;
      const taRef = db
        .collection("companies")
        .doc(companyId)
        .collection("agences")
        .doc(agencyId)
        .collection("tripAssignments");

      let cursor: admin.firestore.DocumentSnapshot | undefined;
      do {
        const q = cursor
          ? taRef.orderBy(admin.firestore.FieldPath.documentId()).startAfter(cursor).limit(BATCH_SIZE)
          : taRef.orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH_SIZE);
        const snap = await q.get();

        for (const docSnap of snap.docs) {
          const data = docSnap.data() as {
            status?: string;
            liveStatus?: unknown;
            tripId?: string;
            date?: string;
            heure?: string;
          };

          if (data.liveStatus != null) {
            skippedHasLive++;
            continue;
          }
          if (data.status !== "planned" && data.status !== "validated") {
            skippedStatus++;
            continue;
          }

          const tripId = String(data.tripId ?? "").trim();
          const date = String(data.date ?? "").trim();
          const heure = String(data.heure ?? "").trim();
          if (!tripId || !date || !heure) {
            continue;
          }

          const expectedCount = await countExpectedReservationsForTripSlot(companyId, agencyId, tripId, date, heure);

          batch.update(docSnap.ref, {
            liveStatus: {
              boardedCount: 0,
              expectedCount,
              status: "waiting",
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          batchCount++;
          updated++;

          if (batchCount >= BATCH_SIZE) {
            await commitBatch();
          }
        }

        cursor = snap.docs.length === BATCH_SIZE ? snap.docs[snap.docs.length - 1] : undefined;
      } while (cursor);
    }
  }

  await commitBatch();

  console.log("migrateTripAssignmentLiveStatus: DONE");
  console.log("Mis à jour:", updated);
  console.log("Ignorés (déjà liveStatus):", skippedHasLive);
  console.log("Ignorés (statut ≠ planned|validated):", skippedStatus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
