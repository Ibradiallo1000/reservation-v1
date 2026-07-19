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
  serverTimestamp,
  setDoc,
  writeBatch,
} = require("firebase/firestore");

const PROJECT_ID = "demo-teliya-local";
const COMPANY_ID = "company_transfer";
const AGENCY_ID = "agency_1";
const OTHER_AGENCY_ID = "agency_2";
const ACCOUNTANT_UID = "accountant_1";
const CASH_BALANCE = 10_000;
const BANK_BALANCE = 25_000;
const BANK_ID = "company_bank_main";

let testEnv;

function paths(requestId, agencyId = AGENCY_ID, bankId = BANK_ID) {
  const operationId = `agency_transfer_${requestId}`;
  return {
    request: `companies/${COMPANY_ID}/treasuryTransferRequests/${requestId}`,
    cash: `companies/${COMPANY_ID}/accounts/agency_${agencyId}_cash`,
    bank: `companies/${COMPANY_ID}/accounts/${bankId}`,
    transaction: `companies/${COMPANY_ID}/financialTransactions/${operationId}`,
    idempotency: `companies/${COMPANY_ID}/financialTransactionIdempotency/${operationId}`,
    operationId,
  };
}

async function seedBase(options = {}) {
  const { includeBank = true } = options;
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const seeds = [
      setDoc(doc(db, `users/${ACCOUNTANT_UID}`), {
        role: "agency_accountant",
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
      }),
      setDoc(doc(db, `companies/${COMPANY_ID}/agences/${AGENCY_ID}`), {
        companyId: COMPANY_ID,
        nom: "Agence 1",
      }),
      setDoc(doc(db, `companies/${COMPANY_ID}/agences/${OTHER_AGENCY_ID}`), {
        companyId: COMPANY_ID,
        nom: "Agence 2",
      }),
      setDoc(doc(db, paths("seed").cash), {
        id: `agency_${AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "cash",
        label: "Caisse agence",
        balance: CASH_BALANCE,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
      setDoc(doc(db, paths("seed", OTHER_AGENCY_ID).cash), {
        id: `agency_${OTHER_AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: OTHER_AGENCY_ID,
        type: "cash",
        label: "Caisse agence",
        balance: CASH_BALANCE,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    ];
    if (includeBank) {
      seeds.push(setDoc(doc(db, paths("seed").bank), {
        id: BANK_ID,
        companyId: COMPANY_ID,
        agencyId: null,
        type: "bank",
        label: "Banque principale",
        balance: BANK_BALANCE,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }));
    }
    await Promise.all(seeds);
  });
}

function addWrites(batch, db, options) {
  const {
    requestId,
    amount,
    agencyId = AGENCY_ID,
    cashDebit = amount,
    bankCredit = amount,
    includeRequest = true,
    includeCash = true,
    includeBank = true,
    includeTransaction = true,
    includeIdempotency = true,
    status = "executed",
  } = options;
  const p = paths(requestId, agencyId);
  const now = Timestamp.now();
  const cashAfter = CASH_BALANCE - cashDebit;
  const bankAfter = options.createBank ? amount : BANK_BALANCE + bankCredit;

  if (includeRequest) {
    batch.set(doc(db, p.request), {
      companyId: COMPANY_ID,
      agencyId,
      fromAccountId: `agency_${agencyId}_cash`,
      toAccountId: BANK_ID,
      amount,
      currency: "XOF",
      description: "Versement test",
      bankReference: null,
      depositSlipUrl: null,
      status,
      initiatedBy: ACCOUNTANT_UID,
      initiatedByRole: "agency_accountant",
      managerDecisionBy: null,
      managerDecisionAt: null,
      managerDecisionReason: null,
      executedBy: status === "executed" ? ACCOUNTANT_UID : null,
      executedAt: status === "executed" ? now : null,
      idempotencyKey: p.operationId,
      createdAt: now,
      updatedAt: serverTimestamp(),
    });
  }
  if (includeCash) {
    batch.update(doc(db, p.cash), {
      balance: cashAfter,
      updatedAt: serverTimestamp(),
      lastDirectTransferId: requestId,
    });
  }
  if (includeBank) {
    if (options.createBank) {
      batch.set(doc(db, p.bank), {
        id: BANK_ID,
        companyId: COMPANY_ID,
        agencyId: null,
        type: "bank",
        label: "Banque principale",
        balance: amount,
        currency: "XOF",
        includeInLiquidity: true,
        lastDirectTransferId: requestId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(doc(db, p.bank), {
        balance: bankAfter,
        updatedAt: serverTimestamp(),
        lastDirectTransferId: requestId,
      });
    }
  }
  if (includeTransaction) {
    batch.set(doc(db, p.transaction), {
      type: "transfer",
      source: "bank",
      amount,
      currency: "XOF",
      companyId: COMPANY_ID,
      agencyId,
      reservationId: null,
      debitAccountId: `agency_${agencyId}_cash`,
      creditAccountId: BANK_ID,
      debitAccountType: "cash",
      creditAccountType: "bank",
      balanceAfter: bankAfter,
      status: "confirmed",
      performedAt: now,
      createdAt: now,
      metadata: {
        requestId,
        performedBy: ACCOUNTANT_UID,
        executionMode: "agency_bank_deposit_direct",
        debitAfter: cashAfter,
        creditAfter: bankAfter,
        bankReference: null,
      },
      referenceType: "agency_deposit",
      referenceId: requestId,
      uniqueReferenceKey: p.operationId,
      paymentChannel: "cash",
      paymentMethod: "cash",
      paymentProvider: null,
    });
  }
  if (includeIdempotency) {
    batch.set(doc(db, p.idempotency), {
      requestId,
      transactionId: p.operationId,
      agencyId,
      amount,
      createdBy: ACCOUNTANT_UID,
      createdAt: serverTimestamp(),
    });
  }
}

async function commit(options) {
  const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
  const batch = writeBatch(db);
  addWrites(batch, db, options);
  return batch.commit();
}

async function runCase(name, assertion) {
  await seedBase();
  await assertion();
  console.log(`PASS ${name}`);
}

(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });

  await runCase("versement direct complet ALLOWED", () =>
    assertSucceeds(commit({ requestId: "direct", amount: 1_000 }))
  );
  await seedBase({ includeBank: false });
  {
    const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
    await assertSucceeds(getDoc(doc(db, paths("missing_bank").bank)));
    console.log("PASS lecture du compte banque absent ALLOWED");
  }
  await assertSucceeds(commit({
    requestId: "direct_create_bank",
    amount: 1_000,
    createBank: true,
  }));
  console.log("PASS versement avec création du compte banque ALLOWED");
  await runCase("ancien pending_manager DENIED", () =>
    assertFails(commit({ requestId: "pending", amount: 1_000, status: "pending_manager" }))
  );
  await runCase("sans transaction DENIED", () =>
    assertFails(commit({ requestId: "missing_tx", amount: 1_000, includeTransaction: false }))
  );
  await runCase("sans idempotence DENIED", () =>
    assertFails(commit({ requestId: "missing_idem", amount: 1_000, includeIdempotency: false }))
  );
  await runCase("débit caisse isolé DENIED", () =>
    assertFails(commit({
      requestId: "cash_only",
      amount: 1_000,
      includeRequest: false,
      includeBank: false,
      includeTransaction: false,
      includeIdempotency: false,
    }))
  );
  await runCase("delta caisse incorrect DENIED", () =>
    assertFails(commit({ requestId: "bad_cash", amount: 1_000, cashDebit: 900 }))
  );
  await runCase("delta banque incorrect DENIED", () =>
    assertFails(commit({ requestId: "bad_bank", amount: 1_000, bankCredit: 900 }))
  );
  await runCase("autre agence DENIED", () =>
    assertFails(commit({ requestId: "other_agency", amount: 1_000, agencyId: OTHER_AGENCY_ID }))
  );

  await seedBase();
  await assertSucceeds(commit({ requestId: "duplicate", amount: 1_000 }));
  await assertFails(commit({ requestId: "duplicate", amount: 1_000 }));
  console.log("PASS double exécution DENIED");

  await testEnv.cleanup();
  console.log("AGENCY_BANK_DEPOSIT_DIRECT_RULES_TEST_OK");
})().catch(async (error) => {
  console.error(error);
  if (testEnv) await testEnv.cleanup();
  process.exit(1);
});
