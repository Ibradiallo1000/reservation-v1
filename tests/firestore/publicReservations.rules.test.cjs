const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-teliya-local";
const COMPANY_ID = "company_public_reservations";
const OTHER_COMPANY_ID = "company_public_reservations_other";
const AGENCY_ID = "agency_public_a";
const RESERVATION_ID = "reservation_public_1";
const PUBLIC_TOKEN = "ABC123";
const OPERATOR_UID = "operator_public";
const OTHER_OPERATOR_UID = "operator_other_company";
const ORDINARY_UID = "ordinary_public";
const PLATFORM_UID = "platform_public";

let testEnv;

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function authDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function publicSnapshot(overrides = {}) {
  return {
    reservationId: RESERVATION_ID,
    companyId: COMPANY_ID,
    agencyId: AGENCY_ID,
    slug: "compagnie-test",
    publicToken: PUBLIC_TOKEN,
    nomClient: "Client Test",
    telephone: "+22370000000",
    depart: "Bamako",
    arrivee: "Segou",
    date: "2026-07-18",
    heure: "08:00",
    montant: 7500,
    seatsGo: 1,
    seatsReturn: 0,
    tripType: "aller_simple",
    status: "en_attente",
    canal: "en_ligne",
    referenceCode: "BIL-001",
    companyName: "Compagnie Test",
    agencyNom: "Agence Test",
    companySlug: "compagnie-test",
    trajetId: "trip_base",
    tripInstanceId: "trip_base_2026-07-18_08-00",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedBase() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `companies/${COMPANY_ID}/agences/${AGENCY_ID}/reservations/${RESERVATION_ID}`), {
        id: RESERVATION_ID,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        publicToken: PUBLIC_TOKEN,
        status: "en_attente",
        statut: "en_attente",
        canal: "en_ligne",
        paymentChannel: "online",
        createdAt: Timestamp.now(),
      }),
      setDoc(doc(db, `users/${OPERATOR_UID}`), {
        role: "operator_digital",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `users/${OTHER_OPERATOR_UID}`), {
        role: "operator_digital",
        companyId: OTHER_COMPANY_ID,
        agencyId: "agency_other",
      }),
      setDoc(doc(db, `users/${ORDINARY_UID}`), {
        role: "guichetier",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `users/${PLATFORM_UID}`), {
        role: "admin_platforme",
      }),
    ]);
  });
}

async function seedPublicReservation(status = "en_attente") {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `publicReservations/${PUBLIC_TOKEN}`), {
      reservationId: RESERVATION_ID,
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      slug: "compagnie-test",
      publicToken: PUBLIC_TOKEN,
      nomClient: "Client Test",
      telephone: "+22370000000",
      depart: "Bamako",
      arrivee: "Segou",
      date: "2026-07-18",
      heure: "08:00",
      montant: 7500,
      seatsGo: 1,
      status,
      canal: "en_ligne",
      referenceCode: "BIL-001",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  });
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });

  await seedBase();

  await assertSucceeds(getDoc(doc(anonDb(), `publicReservations/${PUBLIC_TOKEN}`)));
  await assertFails(getDocs(collection(anonDb(), "publicReservations")));
  await assertFails(deleteDoc(doc(authDb(PLATFORM_UID), `publicReservations/${PUBLIC_TOKEN}`)));

  await assertSucceeds(
    setDoc(doc(anonDb(), `publicReservations/${PUBLIC_TOKEN}`), publicSnapshot())
  );
  await assertSucceeds(
    setDoc(doc(anonDb(), `publicReservations/${RESERVATION_ID}`), {
      token: PUBLIC_TOKEN,
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      slug: "compagnie-test",
    })
  );

  await assertFails(
    setDoc(doc(anonDb(), "publicReservations/FAKE99"), publicSnapshot({
      publicToken: "FAKE99",
      reservationId: "missing_reservation",
    }))
  );
  await assertFails(
    setDoc(doc(anonDb(), "publicReservations/BAD999"), publicSnapshot({
      publicToken: "BAD999",
      status: "confirme",
    }))
  );
  await assertFails(
    setDoc(doc(anonDb(), "publicReservations/bad_pointer"), {
      token: PUBLIC_TOKEN,
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      slug: "compagnie-test",
    })
  );

  await seedBase();
  await seedPublicReservation();

  await assertSucceeds(
    updateDoc(doc(anonDb(), `publicReservations/${PUBLIC_TOKEN}`), {
      status: "preuve_recue",
      paymentReference: "TX-12345",
      updatedAt: serverTimestamp(),
    })
  );

  await seedBase();
  await seedPublicReservation();

  await assertFails(
    updateDoc(doc(anonDb(), `publicReservations/${PUBLIC_TOKEN}`), {
      companyId: OTHER_COMPANY_ID,
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(anonDb(), `publicReservations/${PUBLIC_TOKEN}`), {
      status: "confirme",
      paymentStatus: "paid",
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(authDb(ORDINARY_UID), `publicReservations/${PUBLIC_TOKEN}`), {
      status: "confirme",
      statut: "confirme",
      paymentStatus: "paid",
      payment: { status: "validated" },
      ticketValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );
  await assertFails(
    updateDoc(doc(authDb(OTHER_OPERATOR_UID), `publicReservations/${PUBLIC_TOKEN}`), {
      status: "confirme",
      statut: "confirme",
      paymentStatus: "paid",
      payment: { status: "validated" },
      ticketValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  await assertSucceeds(
    updateDoc(doc(authDb(OPERATOR_UID), `publicReservations/${PUBLIC_TOKEN}`), {
      status: "confirme",
      statut: "confirme",
      paymentStatus: "paid",
      payment: { status: "validated" },
      ticketValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  await seedBase();
  await seedPublicReservation("preuve_recue");
  await assertSucceeds(
    updateDoc(doc(authDb(PLATFORM_UID), `publicReservations/${PUBLIC_TOKEN}`), {
      status: "confirme",
      statut: "confirme",
      paymentStatus: "paid",
      payment: { status: "validated" },
      ticketValidatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  );

  await testEnv.cleanup();
  console.log("PUBLIC_RESERVATIONS_RULES_TEST_OK");
}

main().catch(async (error) => {
  console.error(error);
  if (testEnv) {
    await testEnv.cleanup();
  }
  process.exit(1);
});
