const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} = require("firebase/firestore");

const PROJECT_ID = "monbillet-95b77";
const COMPANY_ID = "company_session_validation";
const AGENCY_ID = "agency_session_validation";
const OTHER_AGENCY_ID = "agency_session_other";
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
      setDoc(doc(db, path(`agences/${OTHER_AGENCY_ID}`)), {
        companyId: COMPANY_ID,
        agencyId: OTHER_AGENCY_ID,
      }),
      setDoc(doc(db, path(`agences/${AGENCY_ID}/shifts/${SHIFT_ID}`)), {
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
      setDoc(doc(db, path(`accounts/agency_${OTHER_AGENCY_ID}_cash`)), {
        id: `agency_${OTHER_AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: OTHER_AGENCY_ID,
        type: "cash",
        label: "Caisse physique autre agence",
        balance: 50_000,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: now,
        updatedAt: now,
      }),
      setDoc(doc(db, path("accounts/company_bank_main")), {
        id: "company_bank_main",
        companyId: COMPANY_ID,
        agencyId: null,
        type: "bank",
        label: "Banque principale",
        balance: 100_000,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: now,
        updatedAt: now,
      }),
      setDoc(doc(db, path("accounts/company_mobile_money")), {
        id: "company_mobile_money",
        companyId: COMPANY_ID,
        agencyId: null,
        type: "mobile_money",
        label: "Mobile Money compagnie",
        balance: 100_000,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: now,
        updatedAt: now,
      }),
      setDoc(doc(db, path("accounts/company_clearing")), {
        id: "company_clearing",
        companyId: COMPANY_ID,
        agencyId: null,
        type: "clearing",
        label: "Compte de compensation compagnie",
        balance: 0,
        currency: "XOF",
        includeInLiquidity: false,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  });
}

function validationLedgerPayload(options = {}) {
  const now = options.now || Timestamp.now();
  return {
    companyId: COMPANY_ID,
    agencyId: options.agencyId || AGENCY_ID,
    shiftId: options.shiftId || SHIFT_ID,
    type: "cash_in",
    source: "shift_accountant_validation",
    amount: AMOUNT,
    expectedAmount: AMOUNT,
    differenceAmount: 0,
    createdAt: serverTimestamp(),
    createdBy: ACCOUNTANT_UID,
    status: "posted",
  };
}

async function validateSessionCommit(options = {}) {
  const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
  const now = Timestamp.now();
  const ledgerAccountId = options.ledgerAccountId || `agency_${AGENCY_ID}_cash`;
  const ledgerAgencyId = options.ledgerAgencyId || AGENCY_ID;
  const ledgerShiftId = options.ledgerShiftId || SHIFT_ID;
  const base = `companies/${COMPANY_ID}/agences/${AGENCY_ID}`;
  const shiftRef = doc(db, `${base}/shifts/${SHIFT_ID}`);
  const reportRef = doc(db, `${base}/shiftReports/${SHIFT_ID}`);
  const agencyRef = doc(db, `companies/${COMPANY_ID}/agences/${AGENCY_ID}`);
  const pendingCashRef = doc(db, path(`accounts/agency_${AGENCY_ID}_pending_cash`));
  const cashAccountRef = doc(db, path(`accounts/agency_${AGENCY_ID}_cash`));
  const ledgerRef = doc(
    db,
    path(`accounts/${ledgerAccountId}/ledger/session_${ledgerShiftId}_accountant_validation`)
  );
  const validatedBy = { id: ACCOUNTANT_UID, name: "Comptable" };
  const validationAudit = {
    validatedBy,
    validatedAt: now,
    receivedCashAmount: AMOUNT,
    computedDifference: 0,
    accountantDeviceFingerprint: "rules-test",
  };

  return runTransaction(db, async (tx) => {
    await Promise.all([
      tx.get(shiftRef),
      tx.get(reportRef),
      tx.get(agencyRef),
      tx.get(cashAccountRef),
      tx.get(ledgerRef),
      tx.get(pendingCashRef),
    ]);

    tx.update(pendingCashRef, {
      balance: 0,
      updatedAt: serverTimestamp(),
    });
    tx.update(shiftRef, {
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      status: "validated_agency",
      validatedAt: now,
      validationAudit,
      accountantValidated: true,
      accountantValidatedAt: now,
      remittanceStatus: "full_remittance",
      remittanceDiscrepancyAmount: 0,
      pendingCashLedgerVersion: 1,
      cashStatus: "validee_manager",
      discrepancyOverrideConfirmed: false,
      discrepancyOverrideBy: null,
      discrepancyOverrideAt: null,
      updatedAt: serverTimestamp(),
    });
    tx.update(reportRef, {
      status: "validated_agency",
      validationLevel: "agency",
      validatedByAgencyAt: now,
      validatedAt: now,
      validationAudit,
      accountantValidated: true,
      accountantValidatedAt: now,
      updatedAt: serverTimestamp(),
    });
    tx.update(cashAccountRef, {
      balance: increment(AMOUNT),
      lastAccountantValidationShiftId: SHIFT_ID,
      updatedAt: serverTimestamp(),
    });
    tx.set(
      ledgerRef,
      validationLedgerPayload({ agencyId: ledgerAgencyId, shiftId: ledgerShiftId, now })
    );
  });
}

async function readPreflightDocs() {
  const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
  await Promise.all([
    getDoc(doc(db, path(`agences/${AGENCY_ID}/shifts/${SHIFT_ID}`))),
    getDoc(doc(db, path(`agences/${AGENCY_ID}/shiftReports/${SHIFT_ID}`))),
    getDoc(doc(db, path(`agences/${AGENCY_ID}`))),
    getDoc(doc(db, path(`accounts/agency_${AGENCY_ID}_cash`))),
    getDoc(doc(db, path(`accounts/agency_${AGENCY_ID}_cash/ledger/session_${SHIFT_ID}_accountant_validation`))),
    getDoc(doc(db, path(`accounts/agency_${AGENCY_ID}_pending_cash`))),
  ]);
}

async function seedExistingLedger() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(
      doc(
        db,
        path(`accounts/agency_${AGENCY_ID}_cash/ledger/session_${SHIFT_ID}_accountant_validation`)
      ),
      validationLedgerPayload({ now: Timestamp.now() })
    );
  });
}

async function runCase(name, assertion) {
  await seed();
  await assertion();
  console.log(`PASS ${name}`);
}

(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });

  await runCase("lectures prealables transaction reelle ALLOWED", () =>
    assertSucceeds(readPreflightDocs())
  );
  await runCase("ledger validation caisse propre agence ALLOWED", () =>
    assertSucceeds(validateSessionCommit())
  );
  await runCase("ledger validation caisse autre agence DENIED", () =>
    assertFails(validateSessionCommit({
      ledgerAccountId: `agency_${OTHER_AGENCY_ID}_cash`,
      ledgerAgencyId: OTHER_AGENCY_ID,
    }))
  );
  await runCase("ledger validation compte banque DENIED", () =>
    assertFails(validateSessionCommit({ ledgerAccountId: "company_bank_main" }))
  );
  await runCase("ledger validation compte Mobile Money DENIED", () =>
    assertFails(validateSessionCommit({ ledgerAccountId: "company_mobile_money" }))
  );
  await runCase("ledger validation autre compte compagnie DENIED", () =>
    assertFails(validateSessionCommit({ ledgerAccountId: "company_clearing" }))
  );
  await runCase("suppression ledger validation DENIED", async () => {
    await seedExistingLedger();
    const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
    await assertFails(deleteDoc(doc(
      db,
      path(`accounts/agency_${AGENCY_ID}_cash/ledger/session_${SHIFT_ID}_accountant_validation`)
    )));
  });
  await runCase("modification arbitraire ancien ledger DENIED", async () => {
    await seedExistingLedger();
    const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
    await assertFails(updateDoc(
      doc(
        db,
        path(`accounts/agency_${AGENCY_ID}_cash/ledger/session_${SHIFT_ID}_accountant_validation`)
      ),
      {
        amount: AMOUNT + 1,
        status: "edited",
        updatedAt: serverTimestamp(),
      }
    ));
  });

  await testEnv.cleanup();
  console.log("AGENCY_SESSION_ACCOUNTANT_VALIDATION_RULES_TEST_OK");
})().catch(async (error) => {
  console.error(error);
  if (testEnv) await testEnv.cleanup();
  process.exit(1);
});
