/* eslint-disable no-console */
const admin = require("firebase-admin");

function mustEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env var ${name}`);
  return String(v).trim();
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith("--")) continue;
    const s = a.slice(2);
    const [k, ...rest] = s.split("=");
    out[k] = rest.join("=");
  }
  return out;
}

async function loadAccountLedgerRecent(db, companyId, accountDocId, limit = 20) {
  const base = db.collection("companies").doc(companyId).collection("accounts").doc(accountDocId);
  const candidates = ["ledger", "ledgerEntries", "entries", "transactions"];

  for (const sub of candidates) {
    try {
      const snap = await base
        .collection(sub)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      if (!snap.empty) return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (_) {
      // ignore
    }
  }

  return [];
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts === "number") return ts;
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const companyId = args.companyId || mustEnv("COMPANY_ID");
  const agencyId = args.agencyId || mustEnv("AGENCY_ID");
  const courierSessionId = args.courierSessionId || mustEnv("COURIER_SESSION_ID");

  const limitTx = Number(args.limitTx || 500);
  const limitLedger = Number(args.limitLedger || 20);

  const saJson = process.env.FIREBASE_ADMIN_SA_JSON;
  if (saJson && String(saJson).trim()) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(saJson)) });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  } else {
    throw new Error(
      "Admin credentials not configured. Set FIREBASE_ADMIN_SA_JSON (JSON string) or GOOGLE_APPLICATION_CREDENTIALS (path to serviceAccount json)."
    );
  }

  const db = admin.firestore();

  const shipmentsCol = db.collection("companies").doc(companyId).collection("shipments");

  // Create shipments from courier session
  const courierShipmentsSnap = await shipmentsCol.where("sessionId", "==", courierSessionId).get();
  const shipmentDocs = courierShipmentsSnap.docs;
  const shipmentIds = shipmentDocs.map((d) => d.id);

  console.log(`Found shipments for courierSessionId=${courierSessionId}: ${shipmentIds.length}`);

  const financialTxCol = db.collection("companies").doc(companyId).collection("financialTransactions");

  const txRows = [];
  for (const sid of shipmentIds) {
    // In your domain model: reservationId == shipmentId
    const snap = await financialTxCol
      .where("type", "==", "payment_received")
      .where("reservationId", "==", sid)
      .limit(limitTx)
      .get();

    for (const d of snap.docs) {
      const data = d.data() || {};
      txRows.push({
        transactionId: d.id,
        shipmentId: sid,
        amount: Number(data.amount ?? 0),
        paymentMethod: data.paymentMethod ?? null,
        agencyId: data.agencyId ?? null,
        creditAccountId: data.creditAccountId ?? null,
        debitAccountId: data.debitAccountId ?? null,
        status: data.status ?? null,
        source: data.source ?? null,
        paymentChannel: data.paymentChannel ?? null,
        createdAt: data.createdAt ?? null,
        performedAt: data.performedAt ?? null,
        reservationId: data.reservationId ?? sid,
      });
    }
  }

  const pendingDocId = `agency_${agencyId}_pending_cash`;
  const cashDocId = `agency_${agencyId}_cash`;

  const pendingRef = db.collection("companies").doc(companyId).collection("accounts").doc(pendingDocId);
  const cashRef = db.collection("companies").doc(companyId).collection("accounts").doc(cashDocId);

  const [pendingSnap, cashSnap] = await Promise.all([pendingRef.get(), cashRef.get()]);

  const pendingBalance = pendingSnap.exists ? Number(pendingSnap.data().balance ?? 0) : 0;
  const cashBalance = cashSnap.exists ? Number(cashSnap.data().balance ?? 0) : 0;

  console.log("=== Balances ===");
  console.log(
    `pending_cash: ${pendingDocId} balance=${pendingBalance} lastTransactionAt=${pendingSnap.exists ? pendingSnap.data().lastTransactionAt ?? null : null}`
  );
  console.log(
    `cash: ${cashDocId} balance=${cashBalance} lastTransactionAt=${cashSnap.exists ? cashSnap.data().lastTransactionAt ?? null : null}`
  );

  const [pendingLedgerRecent, cashLedgerRecent] = await Promise.all([
    loadAccountLedgerRecent(db, companyId, pendingDocId, limitLedger),
    loadAccountLedgerRecent(db, companyId, cashDocId, limitLedger),
  ]);

  console.log("=== TABLE: shipmentId | amount | paymentMethod | agencyId | creditAccountId | status | conclusion ===");

  const txByShipment = new Map();
  for (const r of txRows) {
    const arr = txByShipment.get(r.shipmentId) || [];
    arr.push(r);
    txByShipment.set(r.shipmentId, arr);
  }

  for (const sid of shipmentIds) {
    const rows = txByShipment.get(sid) || [];
    if (rows.length === 0) {
      console.log(`${sid} | 0 | - | - | - | - | NO payment_received found ❌`);
      continue;
    }

    for (const r of rows) {
      let conclusion = "";
      if (r.creditAccountId === pendingDocId) conclusion = "CREDIT pending ✅";
      else if (r.creditAccountId && r.creditAccountId !== pendingDocId) conclusion = `CREDIT other ❌ (${r.creditAccountId})`;
      else conclusion = "creditAccountId missing ❌";

      console.log(
        `${sid} | ${r.amount} | ${String(r.paymentMethod)} | ${String(r.agencyId)} | ${String(r.creditAccountId)} | ${String(r.status)} | ${conclusion}`
      );
    }
  }

  console.log("=== pending_cash ledger recent (reduced) ===");
  console.log(
    pendingLedgerRecent.slice(0, 10).map((x) => ({
      id: x.id,
      createdAt: x.createdAt ?? x.updatedAt ?? null,
      type: x.type ?? null,
      source: x.source ?? null,
      amount: x.amount ?? null,
      balanceAfter: x.balanceAfter ?? null,
      currentBalance: x.currentBalance ?? null,
    }))
  );

  console.log("=== cash ledger recent (reduced) ===");
  console.log(
    cashLedgerRecent.slice(0, 10).map((x) => ({
      id: x.id,
      createdAt: x.createdAt ?? x.updatedAt ?? null,
      type: x.type ?? null,
      source: x.source ?? null,
      amount: x.amount ?? null,
      balanceAfter: x.balanceAfter ?? null,
      currentBalance: x.currentBalance ?? null,
    }))
  );

  // Also output sample financialTransactions details for sanity
  console.log("=== financialTransactions matching (sample latest 20) ===");
  const sample = txRows
    .slice()
    .sort((a, b) => Math.max(toMillis(b.performedAt), toMillis(b.createdAt)) - Math.max(toMillis(a.performedAt), toMillis(a.createdAt)))
    .slice(0, 20);

  console.log(
    sample.map((r) => ({
      transactionId: r.transactionId,
      reservationId: r.reservationId,
      amount: r.amount,
      type: "payment_received",
      source: r.source,
      paymentChannel: r.paymentChannel,
      paymentMethod: r.paymentMethod,
      agencyId: r.agencyId,
      creditAccountId: r.creditAccountId,
      debitAccountId: r.debitAccountId,
      status: r.status,
      createdAt: r.createdAt,
      performedAt: r.performedAt,
    }))
  );
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});

