const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-teliya-local";
const COMPANY_ID = "company_users_security";
const OTHER_COMPANY_ID = "company_users_other";
const USER_UID = "ordinary_user";
const PLATFORM_ADMIN_UID = "platform_admin";
const COMPANY_ADMIN_UID = "company_admin";

let testEnv;

function userDb(uid, token = {}) {
  return testEnv.authenticatedContext(uid, token).firestore();
}

async function seedUsers() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `users/${USER_UID}`), {
        uid: USER_UID,
        email: "ordinary@example.test",
        role: "guichetier",
        companyId: COMPANY_ID,
        agencyId: "agency_a",
        active: true,
        createdAt: Timestamp.now(),
      }),
      setDoc(doc(db, `users/${PLATFORM_ADMIN_UID}`), {
        uid: PLATFORM_ADMIN_UID,
        email: "platform@example.test",
        role: "admin_platforme",
        active: true,
        createdAt: Timestamp.now(),
      }),
      setDoc(doc(db, `users/${COMPANY_ADMIN_UID}`), {
        uid: COMPANY_ADMIN_UID,
        email: "company-admin@example.test",
        role: "admin_compagnie",
        companyId: COMPANY_ID,
        active: true,
        createdAt: Timestamp.now(),
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

  await testEnv.clearFirestore();
  await assertFails(
    setDoc(doc(userDb("new_user"), "users/new_user"), {
      uid: "new_user",
      email: "new-user@example.test",
      role: "admin_platforme",
      companyId: COMPANY_ID,
      createdAt: Timestamp.now(),
    })
  );

  await seedUsers();
  await assertFails(
    updateDoc(doc(userDb(USER_UID), `users/${USER_UID}`), {
      role: "admin_platforme",
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    updateDoc(doc(userDb(USER_UID), `users/${USER_UID}`), {
      companyId: OTHER_COMPANY_ID,
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    updateDoc(doc(userDb(USER_UID), `users/${USER_UID}`), {
      agencyId: "agency_other",
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    updateDoc(doc(userDb(USER_UID), `users/${USER_UID}`), {
      permissions: ["admin:all"],
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    updateDoc(doc(userDb(USER_UID), `users/${USER_UID}`), {
      active: false,
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    setDoc(doc(userDb(USER_UID), "users/other_created_by_user"), {
      uid: "other_created_by_user",
      role: "guichetier",
      companyId: COMPANY_ID,
      createdAt: Timestamp.now(),
    })
  );
  await assertFails(getDocs(collection(userDb(USER_UID), "users")));

  await assertSucceeds(
    updateDoc(doc(userDb(USER_UID), `users/${USER_UID}`), {
      fcmTokens: arrayUnion("token-1"),
      fcmUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  );

  await assertSucceeds(
    setDoc(doc(userDb(PLATFORM_ADMIN_UID), "users/company_admin_created_by_platform"), {
      uid: "company_admin_created_by_platform",
      email: "new-company-admin@example.test",
      role: "admin_compagnie",
      companyId: COMPANY_ID,
      status: "active",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  );

  await assertSucceeds(
    setDoc(doc(userDb(COMPANY_ADMIN_UID), "users/agency_staff_created_by_company_admin"), {
      uid: "agency_staff_created_by_company_admin",
      email: "staff@example.test",
      role: "chefAgence",
      companyId: COMPANY_ID,
      agencyId: "agency_a",
      status: "active",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    setDoc(doc(userDb(COMPANY_ADMIN_UID), "users/platform_admin_attempt"), {
      uid: "platform_admin_attempt",
      email: "bad-platform@example.test",
      role: "admin_platforme",
      companyId: COMPANY_ID,
      status: "active",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  );
  await assertFails(
    setDoc(doc(userDb(COMPANY_ADMIN_UID), "users/other_company_staff"), {
      uid: "other_company_staff",
      email: "other-company@example.test",
      role: "chefAgence",
      companyId: OTHER_COMPANY_ID,
      agencyId: "agency_z",
      status: "active",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    })
  );
  await assertSucceeds(getDoc(doc(userDb(PLATFORM_ADMIN_UID), `users/${USER_UID}`)));
  await assertSucceeds(getDocs(collection(userDb(PLATFORM_ADMIN_UID), "users")));

  await testEnv.cleanup();
  console.log("USERS_PRIVILEGE_ESCALATION_RULES_TEST_OK");
}

main().catch(async (error) => {
  console.error(error);
  if (testEnv) {
    await testEnv.cleanup();
  }
  process.exit(1);
});
