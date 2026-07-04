/* eslint-disable no-console */
"use strict";

const admin = require("firebase-admin");

const COMPANY_ID = "e1zx7bz0Pl1IPVPt2ne4";
const AGENCY_ID = "lYAeJSWBrlybs2k9Rspf";
const CURRENCY = "XOF";
const CLEARING_ACCOUNT_ID = "company_clearing";
const MOBILE_ACCOUNT_ID = "company_mobile_money";
const WRITE_CONFIRMATION = "REGULARIZE_2026_07_04";

const TARGETS = Object.freeze([
  Object.freeze({ paymentId: "fy2oEA0EguCBOJbzPcad", reservationId: "fy2oEA0EguCBOJbzPcad", amount: 7000 }),
  Object.freeze({ paymentId: "n1BRa9XUJCX7dzYopuW7", reservationId: "n1BRa9XUJCX7dzYopuW7", amount: 7000 }),
]);

function parseArgs(argv) {
  const result = Object.create(null);
  for (const value of argv) {
    if (!value.startsWith("--")) continue;
    const [key, ...rest] = value.slice(2).split("=");
    result[key] = rest.length === 0 ? "true" : rest.join("=");
  }
  return result;
}

function initializeAdmin() {
  if (admin.apps.length) return;

  const serviceAccountJson = process.env.FIREBASE_ADMIN_SA_JSON;
  if (serviceAccountJson && serviceAccountJson.trim()) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountJson)),
      projectId: "monbillet-95b77",
    });
    return;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: "monbillet-95b77",
    });
    return;
  }

  throw new Error(
    "Identifiants Admin absents. Définir FIREBASE_ADMIN_SA_JSON ou GOOGLE_APPLICATION_CREDENTIALS."
  );
}

function isTimestamp(value) {
  return Boolean(value && typeof value.toMillis === "function");
}

function requiredString(value, label) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${label}: valeur absente.`);
  return normalized;
}

function normalizedStatus(value) {
  return String(value ?? "").trim().toLocaleLowerCase("fr");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: attendu=${JSON.stringify(expected)}, reçu=${JSON.stringify(actual)}.`);
  }
}

function assertFiniteBalance(data, accountId) {
  const balance = Number(data?.balance);
  if (!Number.isFinite(balance)) {
    throw new Error(`Compte ${accountId}: balance absente ou non numérique.`);
  }
  return balance;
}

function uniqueKeyFor(target) {
  return `payment_received_${target.paymentId}_${target.amount}`;
}

function refsFor(db, target) {
  const companyRef = db.collection("companies").doc(COMPANY_ID);
  const key = uniqueKeyFor(target);
  return {
    reservation: companyRef.collection("agences").doc(AGENCY_ID).collection("reservations").doc(target.reservationId),
    payment: companyRef.collection("payments").doc(target.paymentId),
    clearing: companyRef.collection("accounts").doc(CLEARING_ACCOUNT_ID),
    mobile: companyRef.collection("accounts").doc(MOBILE_ACCOUNT_ID),
    financialTransaction: companyRef.collection("financialTransactions").doc(key),
    financialTransactions: companyRef.collection("financialTransactions"),
    idempotency: companyRef.collection("financialTransactionIdempotency").doc(key),
  };
}

async function findExistingTransactions(refs, target) {
  const queries = [
    refs.financialTransactions.where("uniqueReferenceKey", "==", uniqueKeyFor(target)).limit(5).get(),
    refs.financialTransactions.where("referenceId", "==", target.paymentId).limit(5).get(),
    refs.financialTransactions.where("reservationId", "==", target.reservationId).limit(20).get(),
  ];
  const snapshots = await Promise.all(queries);
  const matches = new Map();

  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      const data = document.data();
      if (
        data.type === "payment_received"
        || data.uniqueReferenceKey === uniqueKeyFor(target)
        || data.referenceId === target.paymentId
      ) {
        matches.set(document.id, data);
      }
    }
  }

  return [...matches.entries()].map(([id, data]) => ({ id, data }));
}

function validateReservation(snapshot, target) {
  if (!snapshot.exists) throw new Error(`Réservation ${target.reservationId}: document absent.`);
  const data = snapshot.data();
  const status = normalizedStatus(data.status || data.statut);
  assertEqual(status, "confirme", `Réservation ${target.reservationId}: statut`);
  assertEqual(normalizedStatus(data.paymentStatus), "paid", `Réservation ${target.reservationId}: paymentStatus`);
  if (!isTimestamp(data.ticketValidatedAt)) {
    throw new Error(`Réservation ${target.reservationId}: ticketValidatedAt absent ou invalide.`);
  }
  const amount = Number(data.montant ?? data.amount);
  assertEqual(amount, target.amount, `Réservation ${target.reservationId}: montant`);
  return data;
}

function validatePayment(snapshot, target) {
  if (!snapshot.exists) throw new Error(`Payment ${target.paymentId}: document absent.`);
  const data = snapshot.data();
  assertEqual(normalizedStatus(data.status), "validated", `Payment ${target.paymentId}: status`);
  assertEqual(normalizedStatus(data.channel), "online", `Payment ${target.paymentId}: channel`);
  assertEqual(Number(data.amount), target.amount, `Payment ${target.paymentId}: amount`);
  assertEqual(data.companyId, COMPANY_ID, `Payment ${target.paymentId}: companyId`);
  assertEqual(data.agencyId, AGENCY_ID, `Payment ${target.paymentId}: agencyId`);
  assertEqual(data.reservationId, target.reservationId, `Payment ${target.paymentId}: reservationId`);
  if (!isTimestamp(data.validatedAt)) {
    throw new Error(`Payment ${target.paymentId}: validatedAt absent ou invalide.`);
  }
  return data;
}

function validateAccounts(clearingSnapshot, mobileSnapshot) {
  if (!clearingSnapshot.exists) throw new Error(`Compte ${CLEARING_ACCOUNT_ID}: document absent.`);
  if (!mobileSnapshot.exists) throw new Error(`Compte ${MOBILE_ACCOUNT_ID}: document absent.`);

  const clearing = clearingSnapshot.data();
  const mobile = mobileSnapshot.data();
  assertEqual(clearing.companyId, COMPANY_ID, `${CLEARING_ACCOUNT_ID}: companyId`);
  assertEqual(clearing.agencyId ?? null, null, `${CLEARING_ACCOUNT_ID}: agencyId`);
  assertEqual(clearing.type, "virtual_clearing", `${CLEARING_ACCOUNT_ID}: type`);
  assertEqual(clearing.includeInLiquidity, false, `${CLEARING_ACCOUNT_ID}: includeInLiquidity`);
  assertEqual(mobile.companyId, COMPANY_ID, `${MOBILE_ACCOUNT_ID}: companyId`);
  assertEqual(mobile.agencyId ?? null, null, `${MOBILE_ACCOUNT_ID}: agencyId`);
  assertEqual(mobile.type, "mobile_money", `${MOBILE_ACCOUNT_ID}: type`);
  assertEqual(mobile.includeInLiquidity, true, `${MOBILE_ACCOUNT_ID}: includeInLiquidity`);

  return {
    clearingBalance: assertFiniteBalance(clearing, CLEARING_ACCOUNT_ID),
    mobileBalance: assertFiniteBalance(mobile, MOBILE_ACCOUNT_ID),
  };
}

async function inspectTarget(db, target) {
  const refs = refsFor(db, target);
  const [reservationSnapshot, paymentSnapshot, clearingSnapshot, mobileSnapshot, idempotencySnapshot, txSnapshot] =
    await Promise.all([
      refs.reservation.get(),
      refs.payment.get(),
      refs.clearing.get(),
      refs.mobile.get(),
      refs.idempotency.get(),
      refs.financialTransaction.get(),
    ]);

  const reservation = validateReservation(reservationSnapshot, target);
  const payment = validatePayment(paymentSnapshot, target);
  const balances = validateAccounts(clearingSnapshot, mobileSnapshot);
  const existingTransactions = await findExistingTransactions(refs, target);

  if (idempotencySnapshot.exists) {
    throw new Error(`Idempotence ${refs.idempotency.path}: existe déjà.`);
  }
  if (txSnapshot.exists) {
    throw new Error(`Transaction déterministe ${refs.financialTransaction.path}: existe déjà.`);
  }
  if (existingTransactions.length > 0) {
    throw new Error(
      `Transaction financière déjà liée au paiement: ${existingTransactions.map((item) => item.id).join(", ")}.`
    );
  }

  const provider = requiredString(reservation.preuveVia, `Réservation ${target.reservationId}: preuveVia`);
  assertEqual(normalizedStatus(provider), "sarali", `Réservation ${target.reservationId}: preuveVia`);

  return {
    refs,
    reservation,
    payment,
    provider: "Sarali",
    balances,
    simulated: {
      clearingBefore: balances.clearingBalance,
      clearingAfter: balances.clearingBalance - target.amount,
      mobileBefore: balances.mobileBalance,
      mobileAfter: balances.mobileBalance + target.amount,
    },
  };
}

function printInspection(target, inspection) {
  console.log("\n--------------------------------------------------");
  console.log(`[DRY_RUN] Paiement ${target.paymentId}`);
  console.table({
    companyId: COMPANY_ID,
    agencyId: AGENCY_ID,
    reservationId: target.reservationId,
    paymentId: target.paymentId,
    amount: target.amount,
    reservationStatus: inspection.reservation.status ?? inspection.reservation.statut,
    paymentStatus: inspection.payment.status,
    paymentChannel: inspection.payment.channel,
    ticketValidatedAt: inspection.reservation.ticketValidatedAt.toDate().toISOString(),
    paymentValidatedAt: inspection.payment.validatedAt.toDate().toISOString(),
    paymentProvider: inspection.provider,
    idempotency: "ABSENTE",
    financialTransaction: "ABSENTE",
  });
  console.table(inspection.simulated);
  console.log("[DRY_RUN] Écritures simulées:");
  console.log(`  CREATE ${inspection.refs.financialTransaction.path}`);
  console.log(`  CREATE ${inspection.refs.idempotency.path}`);
  console.log(`  UPDATE ${inspection.refs.clearing.path} (balance -${target.amount})`);
  console.log(`  UPDATE ${inspection.refs.mobile.path} (balance +${target.amount})`);
  console.log("  AUCUNE écriture reservation/payment");
}

async function executeTarget(db, target) {
  const refs = refsFor(db, target);

  return db.runTransaction(async (transaction) => {
    const [reservationSnapshot, paymentSnapshot, clearingSnapshot, mobileSnapshot, idempotencySnapshot, txSnapshot] =
      await Promise.all([
        transaction.get(refs.reservation),
        transaction.get(refs.payment),
        transaction.get(refs.clearing),
        transaction.get(refs.mobile),
        transaction.get(refs.idempotency),
        transaction.get(refs.financialTransaction),
      ]);

    const reservation = validateReservation(reservationSnapshot, target);
    const payment = validatePayment(paymentSnapshot, target);
    const balances = validateAccounts(clearingSnapshot, mobileSnapshot);

    if (idempotencySnapshot.exists || txSnapshot.exists) {
      throw new Error(`Abandon ${target.paymentId}: transaction ou idempotence déjà présente.`);
    }

    // The write path remains unreachable unless all three explicit execution guards are supplied.
    const provider = requiredString(reservation.preuveVia, `Réservation ${target.reservationId}: preuveVia`);
    assertEqual(normalizedStatus(provider), "sarali", `Réservation ${target.reservationId}: preuveVia`);
    const now = admin.firestore.Timestamp.now();
    const transactionId = refs.financialTransaction.id;
    const uniqueReferenceKey = uniqueKeyFor(target);
    const clearingAfter = balances.clearingBalance - target.amount;
    const mobileAfter = balances.mobileBalance + target.amount;

    transaction.update(refs.clearing, {
      balance: clearingAfter,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastOnlinePaymentTransactionId: transactionId,
    });
    transaction.update(refs.mobile, {
      balance: mobileAfter,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastOnlinePaymentTransactionId: transactionId,
    });
    transaction.create(refs.financialTransaction, {
      type: "payment_received",
      source: "mobile_money",
      amount: target.amount,
      currency: CURRENCY,
      companyId: COMPANY_ID,
      agencyId: AGENCY_ID,
      reservationId: target.reservationId,
      debitAccountId: CLEARING_ACCOUNT_ID,
      creditAccountId: MOBILE_ACCOUNT_ID,
      creditAccountType: "mobile_money",
      balanceAfter: mobileAfter,
      status: "confirmed",
      performedAt: payment.validatedAt,
      createdAt: now,
      metadata: {
        validatedBy: payment.validatedBy ?? null,
        accountingScope: "company_mobile_money",
        provider: "Sarali",
        paymentProviderSource: "reservation.preuveVia",
        debitAfter: clearingAfter,
        creditAfter: mobileAfter,
      },
      referenceType: "payment",
      referenceId: target.paymentId,
      uniqueReferenceKey,
      paymentChannel: "online",
      paymentMethod: "mobile_money",
      paymentProvider: "Sarali",
    });
    transaction.create(refs.idempotency, {
      transactionId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { transactionId, clearingAfter, mobileAfter };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const executionRequested = args["dry-run"] === "false";
  const confirmationMatches = args.confirm === WRITE_CONFIRMATION;
  const explicitApproval = process.env.TELIYA_ALLOW_HISTORICAL_REGULARIZATION === "true";
  const execute = executionRequested && confirmationMatches && explicitApproval;
  const dryRun = !execute;

  if (executionRequested && !execute) {
    console.warn(
      `[SAFETY] Exécution refusée, maintien en DRY_RUN. Exiger ` +
      `TELIYA_ALLOW_HISTORICAL_REGULARIZATION=true et --confirm=${WRITE_CONFIRMATION}.`
    );
  }

  initializeAdmin();
  const db = admin.firestore();

  console.log("==================================================");
  console.log("RÉGULARISATION PAIEMENTS ONLINE HISTORIQUES");
  console.log(`Mode: ${dryRun ? "DRY_RUN (LECTURE SEULE)" : "EXECUTION AUTORISÉE"}`);
  console.log(`Projet: ${admin.app().options.projectId}`);
  console.log(`Compagnie: ${COMPANY_ID}`);
  console.log(`Agence analytique: ${AGENCY_ID}`);
  console.log(`Paiements autorisés: ${TARGETS.map((target) => target.paymentId).join(", ")}`);
  console.log("==================================================");

  const inspections = [];
  for (const target of TARGETS) {
    const inspection = await inspectTarget(db, target);
    inspections.push({ target, inspection });
    printInspection(target, inspection);
  }

  const initialClearing = inspections[0].inspection.balances.clearingBalance;
  const initialMobile = inspections[0].inspection.balances.mobileBalance;
  for (const { inspection } of inspections) {
    assertEqual(inspection.balances.clearingBalance, initialClearing, "Solde clearing cohérent entre contrôles");
    assertEqual(inspection.balances.mobileBalance, initialMobile, "Solde Mobile Money cohérent entre contrôles");
  }
  const total = TARGETS.reduce((sum, target) => sum + target.amount, 0);

  console.log("\n==================================================");
  console.log("SYNTHÈSE GLOBALE");
  console.table({
    paiements: TARGETS.length,
    montantTotal: total,
    companyClearingAvant: initialClearing,
    companyClearingAprèsSimulé: initialClearing - total,
    companyMobileMoneyAvant: initialMobile,
    companyMobileMoneyAprèsSimulé: initialMobile + total,
  });

  if (dryRun) {
    console.log("[DRY_RUN] Tous les contrôles sont conformes. ZÉRO ÉCRITURE EFFECTUÉE.");
    return;
  }

  // A fresh transaction repeats every invariant immediately before each atomic commit.
  for (const target of TARGETS) {
    const result = await executeTarget(db, target);
    console.log(`[EXECUTE] ${target.paymentId}:`, result);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[REGULARIZATION_ABORTED]", {
      message: error instanceof Error ? error.message : String(error),
      code: error?.code ?? null,
    });
    process.exit(1);
  });
