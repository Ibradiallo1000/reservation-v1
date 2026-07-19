/*
Local minimal audit script for Firestore.
Objective: verify reservations exist for:
companies/{companyId}/agences/{agencyId}/reservations where date == 2026-06-17

Requirements:
- Node.js
- firebase-admin installed in this workspace:
  npm i firebase-admin
- Set service account credentials:
  - either via env var GOOGLE_APPLICATION_CREDENTIALS pointing to a JSON file
  - or edit credentials line below to use a local path.

DO NOT commit any credentials.
*/

import admin from 'firebase-admin';

const STAGING_PROJECT_ID = 'teliya-staging';
const PRODUCTION_PROJECT_ID = 'monbillet-95b77';

const projectId = process.env.FIREBASE_PROJECT_ID || STAGING_PROJECT_ID;
const companyId = process.env.TELIYA_AUDIT_COMPANY_ID;
const agencyId = process.env.TELIYA_AUDIT_AGENCY_ID;
const date = process.env.TELIYA_AUDIT_DATE;

function assertStagingOnly() {
  if (projectId === PRODUCTION_PROJECT_ID) {
    throw new Error('REFUS ABSOLU: audit local interdit sur le projet production.');
  }
  if (projectId !== STAGING_PROJECT_ID) {
    throw new Error(`Projet Firebase attendu: ${STAGING_PROJECT_ID}. Recu: ${projectId || '(absent)'}`);
  }
  for (const [name, value] of Object.entries({ TELIYA_AUDIT_COMPANY_ID: companyId, TELIYA_AUDIT_AGENCY_ID: agencyId, TELIYA_AUDIT_DATE: date })) {
    if (!value) throw new Error(`${name} est obligatoire pour cet audit staging.`);
  }
}

async function main() {
  assertStagingOnly();
  // Uses GOOGLE_APPLICATION_CREDENTIALS by default.
  // If you prefer, replace applicationDefault() with:
  // admin.credential.cert(require('./path/to/serviceAccount.json'))
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId,
  });

  const db = admin.firestore();
  const col = db
    .collection('companies')
    .doc(companyId)
    .collection('agences')
    .doc(agencyId)
    .collection('reservations');

  // 1) Total reservations for that date
  const snap = await col.where('date', '==', date).get();
  console.log(`TOTAL reservations where date==${date}:`, snap.size);

  // 2) Group by date + heure + depart + arrivee
  // Note: fields may be null/undefined; we coerce to '' for grouping.
  const groups = new Map();
  const statuts = new Set();

  let example = null;

  for (const d of snap.docs) {
    const data = d.data() || {};

    const dateVal = String(data.date ?? '').trim();
    const heure = String(data.heure ?? data.time ?? '').trim();
    const depart = String(data.depart ?? '').trim();
    const arrivee = String(data.arrivee ?? data.arrival ?? '').trim();

    const statut = data.statut;
    const canal = data.canal;

    if (statut !== undefined) statuts.add(String(statut));

    const seats = Number(data.seatsGo ?? data.places ?? data.seats ?? 1) || 1;

    const tripId = data.tripId ?? null;
    const trajetId = data.trajetId ?? null;

    const key = `${dateVal}|${heure}|${depart}|${arrivee}`;
    const g = groups.get(key) || {
      date: dateVal,
      heure,
      depart,
      arrivee,
      totalReservations: 0,
      totalSeatsGo: 0,
      statuts: new Set(),
      canaux: new Set(),
      tripIdSet: new Set(),
      trajetIdSet: new Set(),
      sampleIds: [],
    };

    g.totalReservations += 1;
    g.totalSeatsGo += seats;
    if (statut !== undefined) g.statuts.add(String(statut));
    if (canal !== undefined) g.canaux.add(String(canal));
    if (tripId) g.tripIdSet.add(String(tripId));
    if (trajetId) g.trajetIdSet.add(String(trajetId));

    if (g.sampleIds.length < 3) g.sampleIds.push(d.id);

    groups.set(key, g);

    if (!example) {
      example = {
        id: d.id,
        date: dateVal,
        heure,
        depart,
        arrivee,
        statut,
        canal,
        tripId: tripId ?? null,
        trajetId: trajetId ?? null,
      };
    }
  }

  const groupedArr = Array.from(groups.values())
    .map((g) => ({
      date: g.date,
      heure: g.heure,
      depart: g.depart,
      arrivee: g.arrivee,
      totalReservations: g.totalReservations,
      totalSeatsGo: g.totalSeatsGo,
      statuts: Array.from(g.statuts),
      canaux: Array.from(g.canaux),
      tripId: Array.from(g.tripIdSet),
      trajetId: Array.from(g.trajetIdSet),
      sampleIds: g.sampleIds,
    }))
    .sort((a, b) => (a.heure < b.heure ? -1 : a.heure > b.heure ? 1 : 0));

  console.log('\nGROUP BY date+heure+depart+arrivee (summary):');
  console.log(groupedArr);

  console.log('\nSTATUTS présents (raw):');
  console.log(Array.from(statuts));

  console.log('\nEXEMPLE réel trouvé:');
  console.log(example);
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});

