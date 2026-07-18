const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-teliya-local";
const COMPANY_ID = "company_platform_content";
const OTHER_COMPANY_ID = "company_platform_content_other";
const PLATFORM_UID = "platform_content_admin";
const COMPANY_ADMIN_UID = "platform_content_company_admin";
const OTHER_COMPANY_ADMIN_UID = "platform_content_other_company_admin";
const ORDINARY_UID = "platform_content_ordinary";

let testEnv;

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function authDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function mediaPayload(overrides = {}) {
  return {
    url: "https://res.cloudinary.com/demo/image/upload/platform/content.jpg",
    type: "autre",
    nom: "Image",
    createdAt: serverTimestamp(),
    ...overrides,
  };
}

function planPayload(overrides = {}) {
  return {
    name: "Premium",
    priceMonthly: 250000,
    quotaReservations: 10000,
    digitalFeePercent: 2,
    feeGuichet: 100,
    minimumMonthly: 100000,
    maxAgences: 10,
    supportLevel: "priority",
    features: {
      publicPage: true,
      onlineBooking: true,
      guichet: true,
    },
    ...overrides,
  };
}

function metaPayload(overrides = {}) {
  return {
    status: "active",
    version: "2026-07",
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

async function seedBase() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `users/${PLATFORM_UID}`), {
        role: "admin_platforme",
      }),
      setDoc(doc(db, `users/${COMPANY_ADMIN_UID}`), {
        role: "admin_compagnie",
        companyId: COMPANY_ID,
      }),
      setDoc(doc(db, `users/${OTHER_COMPANY_ADMIN_UID}`), {
        role: "admin_compagnie",
        companyId: OTHER_COMPANY_ID,
      }),
      setDoc(doc(db, `users/${ORDINARY_UID}`), {
        role: "guichetier",
        companyId: COMPANY_ID,
      }),
      setDoc(doc(db, "medias/media_seed"), {
        url: "https://res.cloudinary.com/demo/image/upload/platform/seed.jpg",
        type: "autre",
        nom: "Seed",
        companyId: COMPANY_ID,
      }),
      setDoc(doc(db, "plans/premium"), {
        name: "Premium",
        priceMonthly: 250000,
        quotaReservations: 10000,
        digitalFeePercent: 2,
        feeGuichet: 100,
        minimumMonthly: 100000,
        maxAgences: 10,
        supportLevel: "priority",
        features: {
          publicPage: true,
          onlineBooking: true,
          guichet: true,
        },
      }),
      setDoc(doc(db, "_meta/plansCatalog"), {
        status: "active",
        version: "2026-07",
      }),
    ]);
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

  await assertSucceeds(getDoc(doc(authDb(ORDINARY_UID), "medias/media_seed")));
  await assertSucceeds(getDocs(collection(authDb(COMPANY_ADMIN_UID), "medias")));
  await assertFails(getDocs(collection(anonDb(), "medias")));
  await assertFails(setDoc(doc(anonDb(), "medias/anon_media"), mediaPayload()));
  await assertFails(setDoc(doc(authDb(ORDINARY_UID), "medias/ordinary_media"), mediaPayload()));
  await assertFails(setDoc(doc(authDb(COMPANY_ADMIN_UID), "medias/company_media"), mediaPayload({ companyId: COMPANY_ID })));
  await assertFails(updateDoc(doc(authDb(OTHER_COMPANY_ADMIN_UID), "medias/media_seed"), {
    companyId: OTHER_COMPANY_ID,
  }));
  await assertFails(deleteDoc(doc(authDb(COMPANY_ADMIN_UID), "medias/media_seed")));
  await assertSucceeds(setDoc(doc(authDb(PLATFORM_UID), "medias/platform_media"), mediaPayload()));
  await assertSucceeds(updateDoc(doc(authDb(PLATFORM_UID), "medias/media_seed"), {
    nom: "Seed updated",
  }));
  await assertSucceeds(deleteDoc(doc(authDb(PLATFORM_UID), "medias/platform_media")));

  await assertSucceeds(getDoc(doc(anonDb(), "plans/premium")));
  await assertSucceeds(getDocs(collection(anonDb(), "plans")));
  await assertFails(setDoc(doc(authDb(ORDINARY_UID), "plans/basic"), planPayload({
    priceMonthly: 1,
    features: { publicPage: false, onlineBooking: false, guichet: false },
  })));
  await assertFails(updateDoc(doc(authDb(COMPANY_ADMIN_UID), "plans/premium"), {
    priceMonthly: 1,
    quotaReservations: 999999,
    digitalFeePercent: 0,
    supportLevel: "enterprise",
  }));
  await assertFails(deleteDoc(doc(authDb(COMPANY_ADMIN_UID), "plans/premium")));
  await assertSucceeds(setDoc(doc(authDb(PLATFORM_UID), "plans/standard"), planPayload({
    name: "Standard",
    priceMonthly: 100000,
  })));
  await assertSucceeds(updateDoc(doc(authDb(PLATFORM_UID), "plans/premium"), {
    priceMonthly: 260000,
  }));
  await assertSucceeds(deleteDoc(doc(authDb(PLATFORM_UID), "plans/standard")));

  await assertSucceeds(getDoc(doc(anonDb(), "_meta/plansCatalog")));
  await assertSucceeds(getDocs(collection(anonDb(), "_meta")));
  await assertFails(setDoc(doc(anonDb(), "_meta/publicWrite"), metaPayload()));
  await assertFails(setDoc(doc(authDb(ORDINARY_UID), "_meta/ordinaryWrite"), metaPayload()));
  await assertFails(updateDoc(doc(authDb(COMPANY_ADMIN_UID), "_meta/plansCatalog"), {
    status: "disabled",
  }));
  await assertFails(deleteDoc(doc(authDb(COMPANY_ADMIN_UID), "_meta/plansCatalog")));
  await assertSucceeds(setDoc(doc(authDb(PLATFORM_UID), "_meta/platformWrite"), metaPayload()));
  await assertSucceeds(updateDoc(doc(authDb(PLATFORM_UID), "_meta/plansCatalog"), {
    status: "active",
    updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(deleteDoc(doc(authDb(PLATFORM_UID), "_meta/platformWrite")));

  await testEnv.cleanup();
  console.log("PLATFORM_CONTENT_RULES_TEST_OK");
}

main().catch(async (error) => {
  console.error(error);
  if (testEnv) {
    await testEnv.cleanup();
  }
  process.exit(1);
});
