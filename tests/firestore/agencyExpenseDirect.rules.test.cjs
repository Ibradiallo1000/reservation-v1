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
const COMPANY_ID = "company_1";
const AGENCY_ID = "agency_1";
const OTHER_AGENCY_ID = "agency_2";
const ACCOUNTANT_UID = "accountant_1";
const THRESHOLD = 1000;
const OPENING_BALANCE = 10000;

let testEnv;

function paths(expenseId, agencyId = AGENCY_ID) {
  const operationId = `expense_${expenseId}`;
  return {
    expense: `companies/${COMPANY_ID}/expenses/${expenseId}`,
    cash: `companies/${COMPANY_ID}/accounts/agency_${agencyId}_cash`,
    clearing: `companies/${COMPANY_ID}/accounts/agency_${agencyId}_expense_clearing`,
    transaction: `companies/${COMPANY_ID}/financialTransactions/${operationId}`,
    idempotency: `companies/${COMPANY_ID}/financialTransactionIdempotency/${operationId}`,
    operationId,
  };
}

async function seedBase(options = {}) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
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
      setDoc(doc(db, `companies/${COMPANY_ID}/financialSettings/current`), {
        expenseApprovalThresholds: {
          agencyManagerLimit: THRESHOLD,
          accountantLimit: 5000,
          ceoLimit: 10000,
        },
      }),
      setDoc(doc(db, paths("seed").cash), {
        id: `agency_${AGENCY_ID}_cash`,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "cash",
        label: "Caisse physique agence",
        balance: OPENING_BALANCE,
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
        label: "Caisse physique agence",
        balance: OPENING_BALANCE,
        currency: "XOF",
        includeInLiquidity: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    ]);
    if (options.clearingBalance != null) {
      await setDoc(doc(db, paths("seed").clearing), {
        id: `agency_${AGENCY_ID}_expense_clearing`,
        companyId: COMPANY_ID,
        agencyId: AGENCY_ID,
        type: "virtual_clearing",
        label: "Contrepartie dépenses agence",
        balance: options.clearingBalance,
        currency: "XOF",
        includeInLiquidity: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    }
  });
}

function expensePayload(expenseId, amount, agencyId, status) {
  const paid = status === "paid";
  const operationId = `expense_${expenseId}`;
  const now = Timestamp.now();
  return {
    companyId: COMPANY_ID,
    agencyId,
    expenseType: "agency",
    category: "fuel",
    description: "",
    amount,
    accountId: `agency_${agencyId}_cash`,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    createdBy: ACCOUNTANT_UID,
    createdAt: now,
    updatedAt: serverTimestamp(),
    status,
    paidAt: paid ? now : null,
    transactionId: paid ? operationId : null,
    idempotencyKey: paid ? operationId : null,
  };
}

function addDirectWrites(batch, db, options) {
  const {
    expenseId,
    amount,
    agencyId = AGENCY_ID,
    cashDebit = amount,
    clearingCredit = amount,
    previousClearingBalance = 0,
    clearingExists = false,
    includeExpense = true,
    includeCash = true,
    includeClearing = true,
    includeTransaction = true,
    includeIdempotency = true,
  } = options;
  const p = paths(expenseId, agencyId);
  const cashAfter = OPENING_BALANCE - cashDebit;
  const clearingAfter = previousClearingBalance + clearingCredit;
  const now = Timestamp.now();

  if (includeExpense) {
    batch.set(doc(db, p.expense), expensePayload(expenseId, amount, agencyId, "paid"));
  }
  if (includeCash) {
    batch.update(doc(db, p.cash), {
      balance: cashAfter,
      updatedAt: serverTimestamp(),
      lastDirectExpenseId: expenseId,
    });
  }
  if (includeClearing) {
    if (clearingExists) {
      batch.update(doc(db, p.clearing), {
        balance: clearingAfter,
        lastDirectExpenseId: expenseId,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(doc(db, p.clearing), {
        id: `agency_${agencyId}_expense_clearing`,
        companyId: COMPANY_ID,
        agencyId,
        type: "virtual_clearing",
        label: "Contrepartie dépenses agence",
        balance: clearingAfter,
        currency: "XOF",
        includeInLiquidity: false,
        lastDirectExpenseId: expenseId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  }
  if (includeTransaction) {
    batch.set(doc(db, p.transaction), {
      type: "expense",
      source: "cash",
      amount,
      currency: "XOF",
      companyId: COMPANY_ID,
      agencyId,
      reservationId: null,
      debitAccountId: `agency_${agencyId}_cash`,
      creditAccountId: `agency_${agencyId}_expense_clearing`,
      debitAccountType: "cash",
      balanceAfter: clearingAfter,
      status: "confirmed",
      performedAt: now,
      createdAt: now,
      metadata: {
        expenseId,
        performedBy: ACCOUNTANT_UID,
        executionMode: "agency_cash_expense_direct",
        debitAfter: cashAfter,
        creditAfter: clearingAfter,
      },
      referenceType: "expense",
      referenceId: expenseId,
      uniqueReferenceKey: p.operationId,
      paymentChannel: "cash",
      paymentMethod: "cash",
      paymentProvider: null,
    });
  }
  if (includeIdempotency) {
    batch.set(doc(db, p.idempotency), {
      expenseId,
      transactionId: p.operationId,
      agencyId,
      amount,
      createdBy: ACCOUNTANT_UID,
      createdAt: serverTimestamp(),
    });
  }
}

async function directCommit(options) {
  const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
  const batch = writeBatch(db);
  addDirectWrites(batch, db, options);
  return batch.commit();
}

async function pendingCommit(expenseId, amount) {
  const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
  const batch = writeBatch(db);
  batch.set(
    doc(db, paths(expenseId).expense),
    expensePayload(expenseId, amount, AGENCY_ID, "pending_manager")
  );
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
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
  });

  await runCase("lectures préalables service ALLOWED", async () => {
    const db = testEnv.authenticatedContext(ACCOUNTANT_UID).firestore();
    const p = paths("preflight");
    await assertSucceeds(getDoc(doc(db, p.clearing)));
    await assertSucceeds(getDoc(doc(db, p.transaction)));
    await assertSucceeds(getDoc(doc(db, p.idempotency)));
  });
  await runCase("sous seuil ALLOWED", () =>
    assertSucceeds(directCommit({ expenseId: "below", amount: THRESHOLD - 1 }))
  );
  await runCase("égal seuil ALLOWED", () =>
    assertSucceeds(directCommit({ expenseId: "equal", amount: THRESHOLD }))
  );
  await seedBase({ clearingBalance: 2500 });
  await assertSucceeds(directCommit({
    expenseId: "existing_clearing",
    amount: 500,
    previousClearingBalance: 2500,
    clearingExists: true,
  }));
  console.log("PASS clearing existant update ALLOWED");
  await runCase("au-dessus seuil direct DENIED", () =>
    assertFails(directCommit({ expenseId: "above_direct", amount: THRESHOLD + 1 }))
  );
  await runCase("au-dessus seuil pending_manager ALLOWED", () =>
    assertSucceeds(pendingCommit("above_pending", THRESHOLD + 1))
  );
  await runCase("expense paid sans transaction DENIED", () =>
    assertFails(directCommit({
      expenseId: "missing_tx",
      amount: 500,
      includeTransaction: false,
    }))
  );
  await runCase("transaction sans idempotence DENIED", () =>
    assertFails(directCommit({
      expenseId: "missing_idempotency",
      amount: 500,
      includeIdempotency: false,
    }))
  );
  await runCase("débit caisse sans expense DENIED", () =>
    assertFails(directCommit({
      expenseId: "missing_expense",
      amount: 500,
      includeExpense: false,
      includeClearing: false,
      includeTransaction: false,
      includeIdempotency: false,
    }))
  );
  await runCase("clearing sans transaction DENIED", () =>
    assertFails(directCommit({
      expenseId: "clearing_only",
      amount: 500,
      includeExpense: false,
      includeCash: false,
      includeTransaction: false,
      includeIdempotency: false,
    }))
  );
  await runCase("delta différent DENIED", () =>
    assertFails(directCommit({
      expenseId: "wrong_delta",
      amount: 500,
      cashDebit: 400,
    }))
  );
  await runCase("autre agence DENIED", () =>
    assertFails(directCommit({
      expenseId: "other_agency",
      amount: 500,
      agencyId: OTHER_AGENCY_ID,
    }))
  );

  await seedBase();
  await assertSucceeds(directCommit({ expenseId: "duplicate", amount: 500 }));
  await assertFails(directCommit({ expenseId: "duplicate", amount: 500 }));
  console.log("PASS double exécution même expenseId DENIED");

  await testEnv.cleanup();
  console.log("AGENCY_EXPENSE_DIRECT_RULES_TEST_OK");
})().catch(async (error) => {
  console.error(error);
  if (testEnv) await testEnv.cleanup();
  process.exit(1);
});
