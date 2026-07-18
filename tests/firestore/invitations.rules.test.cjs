const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} = require("firebase/firestore");

const PROJECT_ID = "demo-teliya-local";
const COMPANY_ID = "company_invitations";
const OTHER_COMPANY_ID = "company_invitations_other";
const AGENCY_ID = "agency_invitations_a";
const OTHER_AGENCY_ID = "agency_invitations_other";
const PLATFORM_UID = "platform_invitations";
const COMPANY_ADMIN_UID = "company_admin_invitations";
const OTHER_COMPANY_ADMIN_UID = "other_company_admin_invitations";
const AGENCY_MANAGER_UID = "agency_manager_invitations";
const ORDINARY_UID = "ordinary_invitations";
const INVITED_UID = "invited_invitations";
const TOKEN = "invite-token-1";
const OTHER_TOKEN = "invite-token-other";
const LEGACY_ID = "legacy-auto-id";
const LEGACY_TOKEN = "legacy-field-token";
const INVITED_EMAIL = "invitee@example.test";

let testEnv;

function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function authDb(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

function invitationData(overrides = {}) {
  return {
    email: INVITED_EMAIL,
    role: "chefAgence",
    status: "pending",
    token: TOKEN,
    companyId: COMPANY_ID,
    agencyId: AGENCY_ID,
    fullName: "Invitee Test",
    createdAt: Timestamp.now(),
    createdBy: COMPANY_ADMIN_UID,
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
        email: "platform@example.test",
      }),
      setDoc(doc(db, `users/${COMPANY_ADMIN_UID}`), {
        role: "admin_compagnie",
        email: "company-admin@example.test",
        companyId: COMPANY_ID,
      }),
      setDoc(doc(db, `users/${OTHER_COMPANY_ADMIN_UID}`), {
        role: "admin_compagnie",
        email: "other-company-admin@example.test",
        companyId: OTHER_COMPANY_ID,
      }),
      setDoc(doc(db, `users/${AGENCY_MANAGER_UID}`), {
        role: "chefAgence",
        email: "manager@example.test",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `users/${ORDINARY_UID}`), {
        role: "guichetier",
        email: "ordinary@example.test",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `invitations/${TOKEN}`), invitationData()),
      setDoc(doc(db, `invitations/${OTHER_TOKEN}`), invitationData({
        email: "other@example.test",
        token: OTHER_TOKEN,
        companyId: OTHER_COMPANY_ID,
        agencyId: OTHER_AGENCY_ID,
      })),
      setDoc(doc(db, `invitations/${LEGACY_ID}`), invitationData({
        email: "legacy@example.test",
        token: LEGACY_TOKEN,
      })),
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

  await assertSucceeds(getDoc(doc(anonDb(), `invitations/${TOKEN}`)));
  await assertFails(getDoc(doc(anonDb(), `invitations/${LEGACY_ID}`)));
  await assertFails(getDoc(doc(anonDb(), `invitations/${LEGACY_TOKEN}`)));
  await assertFails(getDocs(collection(anonDb(), "invitations")));
  await assertFails(getDoc(doc(authDb(ORDINARY_UID), `invitations/${TOKEN}`)));
  await assertFails(getDoc(doc(authDb(COMPANY_ADMIN_UID), `invitations/${OTHER_TOKEN}`)));

  await assertSucceeds(
    getDocs(query(collection(authDb(COMPANY_ADMIN_UID), "invitations"), where("companyId", "==", COMPANY_ID)))
  );
  await assertSucceeds(
    getDocs(query(
      collection(authDb(AGENCY_MANAGER_UID), "invitations"),
      where("companyId", "==", COMPANY_ID),
      where("agencyId", "==", AGENCY_ID)
    ))
  );
  await assertFails(
    getDocs(query(
      collection(authDb(AGENCY_MANAGER_UID), "invitations"),
      where("companyId", "==", COMPANY_ID),
      where("agencyId", "==", OTHER_AGENCY_ID)
    ))
  );

  await assertSucceeds(
    setDoc(doc(authDb(COMPANY_ADMIN_UID), "invitations/new-company-token"), {
      email: "new@example.test",
      role: "chefAgence",
      status: "pending",
      token: "new-company-token",
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: COMPANY_ADMIN_UID,
    })
  );
  await assertSucceeds(
    setDoc(doc(authDb(AGENCY_MANAGER_UID), "invitations/new-agency-token"), {
      email: "agency-new@example.test",
      role: "guichetier",
      status: "pending",
      token: "new-agency-token",
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: AGENCY_MANAGER_UID,
    })
  );
  await assertFails(
    setDoc(doc(authDb(ORDINARY_UID), "invitations/ordinary-token"), {
      email: "bad@example.test",
      role: "chefAgence",
      status: "pending",
      token: "ordinary-token",
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: ORDINARY_UID,
    })
  );
  await assertFails(
    setDoc(doc(authDb(COMPANY_ADMIN_UID), "invitations/other-company-token"), {
      email: "bad-other@example.test",
      role: "chefAgence",
      status: "pending",
      token: "other-company-token",
      companyId: OTHER_COMPANY_ID,
      agencyId: OTHER_AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: COMPANY_ADMIN_UID,
    })
  );
  await assertFails(
    setDoc(doc(authDb(COMPANY_ADMIN_UID), "invitations/token-mismatch-id"), {
      email: "mismatch@example.test",
      role: "chefAgence",
      status: "pending",
      token: "different-token-field",
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: COMPANY_ADMIN_UID,
    })
  );
  await assertFails(
    setDoc(doc(authDb(OTHER_COMPANY_ADMIN_UID), `invitations/${TOKEN}`), {
      email: "overwrite@example.test",
      role: "chefAgence",
      status: "pending",
      token: TOKEN,
      companyId: OTHER_COMPANY_ID,
      agencyId: OTHER_AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: OTHER_COMPANY_ADMIN_UID,
    })
  );
  await assertFails(
    setDoc(doc(authDb(AGENCY_MANAGER_UID), "invitations/admin-role-token"), {
      email: "bad-admin@example.test",
      role: "admin_compagnie",
      status: "pending",
      token: "admin-role-token",
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      createdAt: serverTimestamp(),
      createdBy: AGENCY_MANAGER_UID,
    })
  );

  await assertSucceeds(
    updateDoc(doc(authDb(INVITED_UID, { email: INVITED_EMAIL }), `invitations/${TOKEN}`), {
      status: "accepted",
      acceptedAt: serverTimestamp(),
      uid: INVITED_UID,
    })
  );

  await seedBase();

  await assertFails(
    updateDoc(doc(authDb(ORDINARY_UID), `invitations/${TOKEN}`), {
      role: "admin_compagnie",
    })
  );
  await assertFails(
    updateDoc(doc(authDb(INVITED_UID, { email: INVITED_EMAIL }), `invitations/${TOKEN}`), {
      companyId: OTHER_COMPANY_ID,
    })
  );
  await assertFails(deleteDoc(doc(authDb(ORDINARY_UID), `invitations/${TOKEN}`)));
  await assertFails(deleteDoc(doc(authDb(OTHER_COMPANY_ADMIN_UID), `invitations/${TOKEN}`)));
  await assertSucceeds(deleteDoc(doc(authDb(COMPANY_ADMIN_UID), `invitations/${TOKEN}`)));
  await assertSucceeds(getDocs(collection(authDb(PLATFORM_UID), "invitations")));

  await testEnv.cleanup();
  console.log("INVITATIONS_RULES_TEST_OK");
}

main().catch(async (error) => {
  console.error(error);
  if (testEnv) {
    await testEnv.cleanup();
  }
  process.exit(1);
});
