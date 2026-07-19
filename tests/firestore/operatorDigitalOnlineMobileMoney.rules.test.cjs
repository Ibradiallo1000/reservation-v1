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
const COMPANY_ID = "company_online";
const OTHER_COMPANY_ID = "company_other";
const AGENCY_ID = "agency_online";
const OPERATOR_UID = "operator_1";
const PAYMENT_ID = "payment_1";
const RESERVATION_ID = "reservation_1";
const AMOUNT = 7_000;

let testEnv;

function refs(companyId = COMPANY_ID, paymentId = PAYMENT_ID, amount = AMOUNT) {
  const key = `payment_received_${paymentId}_${amount}`;
  const transactionId = `tx_${paymentId}_${amount}`;
  return {
    key,
    transactionId,
    payment: `companies/${companyId}/payments/${paymentId}`,
    clearing: `companies/${companyId}/accounts/company_clearing`,
    mobile: `companies/${companyId}/accounts/company_mobile_money`,
    transaction: `companies/${companyId}/financialTransactions/${transactionId}`,
    idempotency: `companies/${companyId}/financialTransactionIdempotency/${key}`,
  };
}

async function seedValidatedPayment({
  companyId = COMPANY_ID,
  paymentId = PAYMENT_ID,
  amount = AMOUNT,
  status = "validated",
  channel = "online",
} = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${OPERATOR_UID}`), {
      role: "operator_digital",
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
    });
    await setDoc(doc(db, refs(companyId, paymentId, amount).payment), {
      companyId,
      agencyId: AGENCY_ID,
      reservationId: RESERVATION_ID,
      amount,
      currency: "XOF",
      channel,
      provider: "orange",
      status,
      validatedAt: Timestamp.now(),
      validatedBy: OPERATOR_UID,
    });
  });
}

function onlineMobileCommit({
  companyId = COMPANY_ID,
  paymentId = PAYMENT_ID,
  paymentAmount = AMOUNT,
  postedAmount = paymentAmount,
  channel = "online",
} = {}) {
  const db = testEnv.authenticatedContext(OPERATOR_UID).firestore();
  const r = refs(companyId, paymentId, paymentAmount);
  const batch = writeBatch(db);
  const now = Timestamp.now();

  batch.set(doc(db, r.clearing), {
    id: "company_clearing",
    companyId,
    agencyId: null,
    type: "virtual_clearing",
    label: "Compensation entrées",
    balance: -postedAmount,
    currency: "XOF",
    includeInLiquidity: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastOnlinePaymentTransactionId: r.transactionId,
  });
  batch.set(doc(db, r.mobile), {
    id: "company_mobile_money",
    companyId,
    agencyId: null,
    type: "mobile_money",
    label: "Mobile money (compagnie)",
    balance: postedAmount,
    currency: "XOF",
    includeInLiquidity: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastOnlinePaymentTransactionId: r.transactionId,
  });
  batch.set(doc(db, r.transaction), {
    type: "payment_received",
    source: "mobile_money",
    amount: postedAmount,
    currency: "XOF",
    companyId,
    agencyId: AGENCY_ID,
    reservationId: RESERVATION_ID,
    debitAccountId: "company_clearing",
    creditAccountId: "company_mobile_money",
    creditAccountType: "mobile_money",
    balanceAfter: postedAmount,
    status: "confirmed",
    performedAt: now,
    createdAt: now,
    metadata: {
      validatedBy: OPERATOR_UID,
      accountingScope: "company_mobile_money",
      debitAfter: -postedAmount,
      creditAfter: postedAmount,
    },
    referenceType: "payment",
    referenceId: paymentId,
    uniqueReferenceKey: r.key,
    paymentChannel: channel,
    paymentMethod: "mobile_money",
    paymentProvider: "orange",
  });
  batch.set(doc(db, r.idempotency), {
    transactionId: r.transactionId,
    createdAt: serverTimestamp(),
  });
  return { db, refs: r, commit: batch.commit() };
}

async function reset() {
  await testEnv.clearFirestore();
}

(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") },
  });

  await reset();
  await seedValidatedPayment();
  const first = onlineMobileCommit();
  await assertSucceeds(first.commit);
  console.log("PASS premier traitement ALLOWED");

  const beforeReplay = await getDoc(doc(first.db, first.refs.mobile));
  const idem = await getDoc(doc(first.db, first.refs.idempotency));
  if (!idem.exists()) throw new Error("Idempotence absente après premier traitement.");
  await assertFails(onlineMobileCommit().commit);
  const afterReplay = await getDoc(doc(first.db, first.refs.mobile));
  if (beforeReplay.data().balance !== afterReplay.data().balance) {
    throw new Error("Le rejeu idempotent a modifié le solde.");
  }
  console.log("PASS second traitement sans double crédit");

  await reset();
  await seedValidatedPayment();
  await assertFails(onlineMobileCommit({ postedAmount: AMOUNT + 500 }).commit);
  console.log("PASS montant modifié DENIED");

  await reset();
  await seedValidatedPayment({ companyId: OTHER_COMPANY_ID });
  await assertFails(onlineMobileCommit({ companyId: OTHER_COMPANY_ID }).commit);
  console.log("PASS autre compagnie DENIED");

  await reset();
  await seedValidatedPayment({ status: "pending" });
  await assertFails(onlineMobileCommit().commit);
  console.log("PASS crédit sans paiement validé DENIED");

  await reset();
  await seedValidatedPayment({ channel: "guichet" });
  await assertFails(onlineMobileCommit({ channel: "guichet" }).commit);
  console.log("PASS routage guichet non capturé par la règle online");

  await testEnv.cleanup();
  console.log("OPERATOR_DIGITAL_ONLINE_MOBILE_MONEY_RULES_TEST_OK");
})().catch(async (error) => {
  console.error(error);
  if (testEnv) await testEnv.cleanup();
  process.exit(1);
});
