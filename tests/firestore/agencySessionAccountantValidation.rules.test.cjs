const fs = require("fs");
const {
  initializeTestEnvironment,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  Timestamp,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} = require("firebase/firestore");

const PROJECT_ID = "monbillet-95b77";
const COMPANY_ID = "company_session_validation";
const AGENCY_ID = "agency_session_validation";
const ACCOUNTANT_UID = "accountant_session_validation";
const SHIFT_ID = "shift_session_validation";
const AMOUNT = 35_000;

let testEnv;

function path(suffix) {
  return `companies/${COMPANY_ID}/${suffix}`;
}

async function seed() {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = Timestamp.now();
    await Promise.all([
      setDoc(doc(db, `users/${ACCOUNTANT_UID}`), {
        role: "agency_accountant",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, path(`agences/${AGENCY_ID}`)), {
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, path(`agences/${AGENCY_ID}/shifts/${SHIFT_ID}`)), {
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        userId: "seller_1",
        status: "closed",
        cashStatus: "fermee",
        totalCash: AMOUNT,
        amount: AMOUNT,
        ecart: 0,
        updatedAt: now,
      }),
      setDoc(doc(db, path(`agences/${AGENCY_ID}/shiftReports/${SHIFT_ID}`)), {
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        status: "closed",
        totalCash: AMOUNT,
        updatedAt: now,
      }),
      setDoc(doc(db, path(`accounts/agency_${AGENCY_ID}_pending_cash`)), {
        id: `agency_${AGENCY_ID}_pending_cash`,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "virtual_clearing",
        label: "Caisse agence - en attente de remise",
        balance: AMOUNT,
        currency: "XOF",
        includeInLiquidity: false,
        createdAt: now,
        updatedAt: now,
      }),
      setDoc(doc(db, path(`accounts/agency_${AGENCY_ID}_cash`)), {
        id: `agency_${AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "cash",
        label: "Caisse physique agence",
        balance: 100_000,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  });
}

async function validateSessionCommit() {
  const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
  const batch = writeBatch(db);
  const now = Timestamp.now();
  const validatedBy = { id: ACCOUNTANT_UID, name: "Comptable" };
  const validationAudit = {
    validatedBy,
    validatedAt: now,
    receivedCashAmount: AMOUNT,
    computedDifference: 0,
    accountantDeviceFingerprint: "rules-test",
  };

  batch.update(doc(db, path(`accounts/agency_${AGENCY_ID}_pending_cash`)), {
    balance: 0,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, path(`agences/${AGENCY_ID}/shifts/${SHIFT_ID}`)), {
    status: "validated_agency",
    validatedAt: now,
    validationAudit,
    accountantValidated: true,
    accountantValidatedAt: now,
    remittanceStatus: "full_remittance",
    remittanceDiscrepancyAmount: 0,
    pendingCashLedgerVersion: "v1",
    cashStatus: "validee_agence",
    discrepancyOverrideConfirmed: false,
    discrepancyOverrideBy: null,
    discrepancyOverrideAt: null,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, path(`agences/${AGENCY_ID}/shiftReports/${SHIFT_ID}`)), {
    status: "validated_agency",
    validationLevel: "agency",
    validatedByAgencyAt: now,
    validatedAt: now,
    validationAudit,
    accountantValidated: true,
    accountantValidatedAt: now,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, path(`accounts/agency_${AGENCY_ID}_cash`)), {
    balance: 135_000,
    lastAccountantValidationShiftId: SHIFT_ID,
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(
      db,
      path(
        `accounts/agency_${AGENCY_ID}_cash/ledger/session_${SHIFT_ID}_accountant_validation`
      )
    ),
    {
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      shiftId: SHIFT_ID,
      type: "cash_in",
      source: "shift_accountant_validation",
      amount: AMOUNT,
      expectedAmount: AMOUNT,
      differenceAmount: 0,
      createdAt: serverTimestamp(),
      createdBy: ACCOUNTANT_UID,
      status: "posted",
    }
  );
  return batch.commit();
}

(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });
  await seed();
  await assertSucceeds(validateSessionCommit());
  await testEnv.cleanup();
  console.log("AGENCY_SESSION_ACCOUNTANT_VALIDATION_RULES_TEST_OK");
})().catch(async (error) => {
  console.error(error);
  if (testEnv) await testEnv.cleanup();
  process.exit(1);
});
