const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  Timestamp,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} = require("firebase/firestore");

const PROJECT_ID = "demo-teliya-local";
const COMPANY_ID = "company_chef_cash";
const AGENCY_ID = "agency_chef_1";
const OTHER_AGENCY_ID = "agency_chef_2";
const MANAGER_UID = "chef_1";
const ACCOUNTANT_UID = "accountant_1";

let testEnv;

function accountPath(agencyId) {
  return `companies/${COMPANY_ID}/accounts/agency_${agencyId}_cash`;
}

async function seedBase(managerRole = "chefAgence") {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, `users/${MANAGER_UID}`), {
        role: managerRole,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `users/${ACCOUNTANT_UID}`), {
        role: "agency_accountant",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `companies/${COMPANY_ID}/agences/${AGENCY_ID}`), {
        companyId: COMPANY_ID,
        nom: "Agence chef 1",
      }),
      setDoc(doc(db, `companies/${COMPANY_ID}/agences/${OTHER_AGENCY_ID}`), {
        companyId: COMPANY_ID,
        nom: "Agence chef 2",
      }),
      setDoc(doc(db, accountPath(AGENCY_ID)), {
        id: `agency_${AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "cash",
        label: "Caisse agence",
        balance: 424000,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
      setDoc(doc(db, accountPath(OTHER_AGENCY_ID)), {
        id: `agency_${OTHER_AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: OTHER_AGENCY_ID,
        type: "cash",
        label: "Caisse autre agence",
        balance: 1000,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
      setDoc(doc(db, `companies/${COMPANY_ID}/accounts/company_clearing`), {
        id: "company_clearing",
        companyId: COMPANY_ID,
        agencyId: null,
        type: "virtual_clearing",
        label: "Compte de contrepartie compagnie",
        balance: 0,
        currency: "XOF",
        includeInLiquidity: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
      setDoc(doc(db, `companies/${COMPANY_ID}/financialAccounts/${AGENCY_ID}_agency_cash`), {
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "cash",
        balance: 424000,
      }),
    ]);
  });
}

function managerDb() {
  return testEnv.authenticatedContext(MANAGER_UID, {
    role: "unused_token_role",
    companyId: COMPANY_ID,
    agencyId: AGENCY_ID,
  }).firestore();
}

function accountantDb() {
  return testEnv.authenticatedContext(ACCOUNTANT_UID, {
    role: "agency_accountant",
    companyId: COMPANY_ID,
    agencyId: AGENCY_ID,
  }).firestore();
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

  for (const role of ["chefAgence", "chefagence", "chef_agence"]) {
    await seedBase(role);
    await assertSucceeds(getDoc(doc(managerDb(), accountPath(AGENCY_ID))));
  }

  await seedBase("chefAgence");
  await assertFails(getDoc(doc(managerDb(), accountPath(OTHER_AGENCY_ID))));
  await assertFails(getDoc(doc(managerDb(), `companies/${COMPANY_ID}/accounts/company_clearing`)));
  await assertFails(
    updateDoc(doc(managerDb(), accountPath(AGENCY_ID)), {
      balance: 423000,
      updatedAt: Timestamp.now(),
    })
  );
  await assertSucceeds(getDoc(doc(accountantDb(), accountPath(AGENCY_ID))));
  await assertFails(getDoc(doc(managerDb(), `companies/${COMPANY_ID}/financialAccounts/${AGENCY_ID}_agency_cash`)));

  await testEnv.cleanup();
  console.log("AGENCY_MANAGER_CASH_ACCOUNT_RULES_TEST_OK");
}

main().catch(async (error) => {
  console.error(error);
  if (testEnv) {
    await testEnv.cleanup();
  }
  process.exit(1);
});
