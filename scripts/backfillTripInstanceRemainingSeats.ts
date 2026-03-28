/**
 * Backfill one-shot : pour chaque tripInstance,
 *   remainingSeats = max(0, capacity − reservedSeats)
 * avec capacity = capacity | seatCapacity | capacitySeats.
 *
 * Remplit aussi les champs canoniques manquants : departure, arrival, time, capacity
 * (miroir des champs legacy), sans supprimer les anciens champs.
 *
 * Optionnel : --canonical-only — n'écrit que departure / arrival / time / capacity (pas remainingSeats).
 *
 * Lancement (racine du projet) :
 *   npx ts-node scripts/backfillTripInstanceRemainingSeats.ts
 *   npx ts-node scripts/backfillTripInstanceRemainingSeats.ts --canonical-only
 *
 * Prérequis : GOOGLE_APPLICATION_CREDENTIALS (service account Firebase).
 */

import admin from "firebase-admin";

const CANONICAL_ONLY = process.argv.includes("--canonical-only");
/** @deprecated no-op : les champs canoniques sont toujours complétés si absents */
const _LEGACY_FLAG = process.argv.includes("--canonical");

admin.initializeApp();
const db = admin.firestore();

const BATCH_MAX = 500;

function seatCapacityOf(d: Record<string, unknown>): number {
  return Math.max(0, Number(d.capacity ?? d.seatCapacity ?? d.capacitySeats ?? 0) || 0);
}

function expectedRemaining(d: Record<string, unknown>): number {
  const cap = seatCapacityOf(d);
  const reserved = Math.max(0, Number(d.reservedSeats ?? 0) || 0);
  return Math.max(0, cap - reserved);
}

function canonicalFieldPatch(d: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const cap = seatCapacityOf(d);
  if (d.capacity == null && cap > 0) patch.capacity = cap;
  const dep = (d.departure ?? d.departureCity ?? d.routeDeparture ?? "").toString().trim();
  const arr = (d.arrival ?? d.arrivalCity ?? d.routeArrival ?? "").toString().trim();
  const time = (d.time ?? d.departureTime ?? "").toString().trim();
  if (!String(d.departure ?? "").trim() && dep) patch.departure = dep;
  if (!String(d.arrival ?? "").trim() && arr) patch.arrival = arr;
  if (!String(d.time ?? "").trim() && time) patch.time = time;
  return patch;
}

async function main() {
  console.log(
    "backfillTripInstanceRemainingSeats: START",
    CANONICAL_ONLY ? "(canonical fields only)" : "(remainingSeats + canonical if missing)"
  );
  if (_LEGACY_FLAG) {
    console.log("Note: --canonical est déprécié (champs canoniques toujours complétés si absents).");
  }

  let updated = 0;
  let skipped = 0;
  let batch = db.batch();
  let batchCount = 0;

  const companiesSnap = await db.collection("companies").get();

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const tiCol = db.collection("companies").doc(companyId).collection("tripInstances");
    const snap = await tiCol.get();

    for (const docSnap of snap.docs) {
      const d = docSnap.data();
      const expected = expectedRemaining(d);
      const current = d.remainingSeats;
      const needsRemaining =
        !CANONICAL_ONLY &&
        (typeof current !== "number" || Number.isNaN(current) || current !== expected);

      const patch: Record<string, unknown> = {};

      if (needsRemaining) {
        patch.remainingSeats = expected;
      }

      Object.assign(patch, canonicalFieldPatch(d));

      if (Object.keys(patch).length === 0) {
        skipped++;
        continue;
      }

      batch.update(docSnap.ref, patch);
      batchCount++;
      updated++;

      if (batchCount >= BATCH_MAX) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  console.log("backfillTripInstanceRemainingSeats: DONE");
  console.log("Documents mis à jour:", updated);
  console.log("Documents inchangés:", skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
