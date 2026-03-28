/**
 * Contrôle comptable agence : entrées espèces = `comptaEncaissements` (validation session) ;
 * sorties = ledger `financialTransactions` ; solde attendu = solde compte caisse ledger.
 */

import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import { agencyCashAccountId } from "@/modules/compagnie/treasury/types";
import { financialAccountRef } from "@/modules/compagnie/treasury/financialAccounts";
import {
  getLedgerBalances,
  isConfirmedTransactionStatus,
  listFinancialTransactionsByPeriod,
} from "@/modules/compagnie/treasury/financialTransactions";
import { agencyCashAccountDocId, ledgerAccountDocRef } from "@/modules/compagnie/treasury/ledgerAccounts";
import {
  sumComptaEncaissementsAllTime,
  sumComptaEncaissementsInRange,
} from "@/modules/agence/comptabilite/comptaEncaissementsService";

const FINANCIAL_TX_COLLECTION = "financialTransactions";
const CASH_AUDITS_COLLECTION = "cashAudits";
const PAGE_SIZE = 500;
const MAX_PAGES = 40;
const CLOSED_SESSION_STATUSES = ["closed", "CLOSED", "validated", "VALIDATED", "validated_agency"] as const;

export type AgencyCashPosition = {
  /** Entrées espèces : somme des écritures `comptaEncaissements` (type encaissement), pas le ledger. */
  totalCashIn: number;
  totalCashOut: number;
  soldeCash: number;
  transactionCount: number;
  /** Nombre de documents `comptaEncaissements` agrégés pour totalCashIn (période ou tout selon l’appel). */
  encaissementCount?: number;
  /** True si la lecture s’est arrêtée à la limite de pagination (données partielles possibles). */
  capped: boolean;
};

export type CashAuditDoc = {
  companyId: string;
  agencyId: string;
  expectedAmount: number;
  actualAmount: number;
  difference: number;
  validatedBy: { id: string; name?: string | null };
  validatedAt: unknown;
  createdAt?: unknown;
};

export type AgencySessionAuditRow = {
  sessionId: string;
  totalExpected: number;
  totalDeclared: number;
  ecart: number;
  status: string;
  anomaly: boolean;
};

export type AgencyFinancialAuditResult = {
  agencyId: string;
  totalVentes: number;
  totalDeclare: number;
  totalCaisse: number;
  totalTransactions: number;
  ecartVenteDeclare: number;
  ecartDeclareCaisse: number;
  status: "OK" | "INCOHERENT";
  sessionsWithGap: AgencySessionAuditRow[];
  anomalies: string[];
  meta: {
    sessionsCount: number;
    transactionsCount: number;
    missingCashAccount: boolean;
    capped: boolean;
  };
};

function financialTransactionsRef(companyId: string) {
  return collection(db, "companies", companyId, FINANCIAL_TX_COLLECTION);
}

function cashAuditsRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, CASH_AUDITS_COLLECTION);
}

function sessionsRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, "sessions");
}

function accountsRef(companyId: string) {
  return collection(db, "companies", companyId, "accounts");
}

/** Sorties de caisse espèces agence : débit sur le compte ledger caisse agence (financialTransactions). */
function isCashOutflowFromAgencyLedger(row: FinancialTransactionDoc, cashAccountDocId: string): boolean {
  if (!isConfirmedTransactionStatus(row.status)) return false;
  const t = row.type;
  /** Jamais compter une vente / encaissement / remise comme sortie de caisse. */
  if (t === "payment_received" || t === "remittance" || t === "bank_withdrawal") {
    return false;
  }
  const debit = String(row.debitAccountId ?? "");
  if (debit !== cashAccountDocId) return false;
  if (row.type === "expense") return true;
  if (row.type === "refund") return true;
  if (row.type === "transfer" || row.type === "transfer_to_bank") return true;
  return false;
}

async function loadAgencyFinancialTransactions(
  companyId: string,
  agencyId: string
): Promise<{ rows: Array<FinancialTransactionDoc & { id: string }>; capped: boolean }> {
  const rows: Array<FinancialTransactionDoc & { id: string }> = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  let capped = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await getDocs(
      query(
        financialTransactionsRef(companyId),
        where("agencyId", "==", agencyId),
        orderBy("performedAt", "desc"),
        limit(PAGE_SIZE),
        ...(last ? [startAfter(last)] : [])
      )
    );
    if (snap.empty) break;
    snap.docs.forEach((d) => {
      rows.push({ id: d.id, ...(d.data() as FinancialTransactionDoc) });
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  return { rows, capped };
}

function aggregateLedgerCashOutflowsOnly(
  rows: Array<FinancialTransactionDoc & { id: string }>,
  agencyId: string
): number {
  const cashDocId = agencyCashAccountDocId(agencyId);
  let totalCashOut = 0;
  for (const row of rows) {
    const raw = Number(row.amount) || 0;
    const mag = Math.abs(raw);
    if (mag <= 0) continue;
    if (isCashOutflowFromAgencyLedger(row, cashDocId)) {
      totalCashOut += mag;
    }
  }
  return totalCashOut;
}

/**
 * Caisse agence : entrées = écritures comptables `comptaEncaissements` (validation session) ;
 * sorties = financialTransactions débitant la caisse physique ; solde affiché = solde ledger caisse.
 */
export async function getAgencyCashPosition(
  companyId: string,
  agencyId: string
): Promise<AgencyCashPosition> {
  const cashDocId = agencyCashAccountDocId(agencyId);
  const mirrorRef = financialAccountRef(companyId, agencyCashAccountId(agencyId));

  const [{ rows, capped: txCapped }, comptaSum, cashLedgerSnap, mirrorSnap] = await Promise.all([
    loadAgencyFinancialTransactions(companyId, agencyId),
    sumComptaEncaissementsAllTime(companyId, agencyId),
    getDoc(ledgerAccountDocRef(companyId, cashDocId)),
    getDoc(mirrorRef),
  ]);

  const totalCashIn = comptaSum.total;
  const totalCashOut = aggregateLedgerCashOutflowsOnly(rows, agencyId);

  const caisseDisponibleAgregat = totalCashIn - totalCashOut;
  const ledgerRaw = cashLedgerSnap.exists() ? (cashLedgerSnap.data() as Record<string, unknown>) : null;
  const ledgerBal = ledgerRaw != null ? Number(ledgerRaw.balance ?? ledgerRaw.currentBalance ?? 0) : null;
  const mirrorBal = mirrorSnap.exists()
    ? Number((mirrorSnap.data() as Record<string, unknown>).currentBalance ?? 0)
    : null;
  /**
   * Priorité : miroir `financialAccounts` (dépenses agence), sinon ledger `accounts`, sinon agrégat compta − sorties.
   * Si miroir et ledger sont à 0 mais des encaissements comptables existent, utiliser l’agrégat.
   */
  let soldeCash: number;
  if (mirrorSnap.exists()) {
    const m = Number(mirrorBal ?? 0);
    const lb = ledgerBal ?? 0;
    if (m !== 0) soldeCash = m;
    else if (lb !== 0) soldeCash = lb;
    else soldeCash = caisseDisponibleAgregat;
  } else if (ledgerBal != null && ledgerBal !== 0) {
    soldeCash = ledgerBal;
  } else {
    soldeCash = caisseDisponibleAgregat;
  }

  console.log("[AgenceCompta][caisse]", {
    totalEncaissements: totalCashIn,
    totalDepenses: totalCashOut,
    caisseDisponibleAgregat,
    soldeLedgerCash: soldeCash,
  });

  return {
    totalCashIn,
    totalCashOut,
    soldeCash,
    transactionCount: rows.length,
    encaissementCount: comptaSum.count,
    capped: txCapped || comptaSum.capped,
  };
}

/**
 * Période : entrées espèces = `comptaEncaissements` sur [rangeFrom, rangeToExclusive) ;
 * sorties = ledger (financialTransactions, performedAt) débitant la caisse physique.
 */
export async function getAgencyCashLedgerPeriodSummary(
  companyId: string,
  agencyId: string,
  rangeFrom: Date,
  rangeToExclusive: Date
): Promise<AgencyCashPosition & { capped: boolean }> {
  const endInclusive = new Date(rangeToExclusive.getTime() - 1);
  const [compta, rows] = await Promise.all([
    sumComptaEncaissementsInRange(companyId, agencyId, rangeFrom, rangeToExclusive),
    listFinancialTransactionsByPeriod(
      companyId,
      Timestamp.fromDate(rangeFrom),
      Timestamp.fromDate(endInclusive),
      agencyId
    ),
  ]);
  const totalCashIn = compta.total;
  const totalCashOut = aggregateLedgerCashOutflowsOnly(rows, agencyId);
  const soldeCash = totalCashIn - totalCashOut;
  const capped = rows.length >= 5000 || compta.capped;
  console.log("[AgenceCompta][caisse][periode]", {
    totalEncaissements: totalCashIn,
    totalDepenses: totalCashOut,
    caisseDisponibleAgregat: soldeCash,
  });
  return {
    totalCashIn,
    totalCashOut,
    soldeCash,
    transactionCount: rows.length,
    encaissementCount: compta.count,
    capped,
  };
}

/**
 * FINANCIAL_TRUTH (ledger) : somme des payment_received confirmés (tous instruments) sur la période.
 */
export async function getAgencyLedgerPaymentReceivedTotalForPeriod(
  companyId: string,
  agencyId: string,
  rangeFrom: Date,
  rangeToExclusive: Date
): Promise<{ total: number; capped: boolean }> {
  const endInclusive = new Date(rangeToExclusive.getTime() - 1);
  const rows = await listFinancialTransactionsByPeriod(
    companyId,
    Timestamp.fromDate(rangeFrom),
    Timestamp.fromDate(endInclusive),
    agencyId
  );
  let total = 0;
  for (const row of rows) {
    if (row.type !== "payment_received") continue;
    if (!isConfirmedTransactionStatus(row.status)) continue;
    const raw = Number(row.amount) || 0;
    if (raw > 0) total += raw;
  }
  return { total, capped: rows.length >= 5000 };
}

/**
 * Caisse opérationnelle affichée pour la trésorerie agence : solde caisse ledger (`accounts`, type cash).
 * Ne pas additionner les `computedDifference` des sessions : le ledger est déjà crédité du montant réellement remis
 * à la validation comptable ; la somme des écarts (reçu − attendu) fausserait le disponible (ex. −150 000 affiché).
 */
export async function getAgencyOperationalAvailableCash(
  companyId: string,
  agencyId: string
): Promise<{
  accountingCash: number;
  adjustmentTotal: number;
  availableCash: number;
  breakdown: { guichetAdjustment: number; courrierAdjustment: number };
}> {
  const ledger = await getLedgerBalances(companyId, agencyId);
  const accountingCash = Number(ledger.cash ?? 0);
  return {
    accountingCash,
    adjustmentTotal: 0,
    availableCash: accountingCash,
    breakdown: { guichetAdjustment: 0, courrierAdjustment: 0 },
  };
}

export async function listAgencyCashAudits(
  companyId: string,
  agencyId: string,
  limitCount = 50
): Promise<Array<CashAuditDoc & { id: string }>> {
  const ref = cashAuditsRef(companyId, agencyId);
  const q = query(ref, orderBy("validatedAt", "desc"), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      companyId: String(x.companyId ?? companyId),
      agencyId: String(x.agencyId ?? agencyId),
      expectedAmount: Number(x.expectedAmount ?? 0),
      actualAmount: Number(x.actualAmount ?? 0),
      difference: Number(x.difference ?? 0),
      validatedBy: (x.validatedBy as CashAuditDoc["validatedBy"]) ?? { id: "" },
      validatedAt: x.validatedAt,
      createdAt: x.createdAt,
    };
  });
}

/**
 * Enregistre un contrôle de caisse (snapshot). Ne crée aucune écriture ledger ni financialMovement.
 */
export async function validateAgencyCash(params: {
  companyId: string;
  agencyId: string;
  actualAmount: number;
  validatedBy: { id: string; name?: string | null };
}): Promise<{ auditId: string; expectedAmount: number; difference: number }> {
  const actual = Number(params.actualAmount);
  if (!Number.isFinite(actual) || actual < 0) {
    throw new Error("Montant réel invalide.");
  }

  const position = await getAgencyCashPosition(params.companyId, params.agencyId);
  const expectedAmount = position.soldeCash;
  const difference = actual - expectedAmount;

  const ref = await addDoc(cashAuditsRef(params.companyId, params.agencyId), {
    companyId: params.companyId,
    agencyId: params.agencyId,
    expectedAmount,
    actualAmount: actual,
    difference,
    validatedBy: params.validatedBy,
    validatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    ledgerTransactionCount: position.transactionCount,
    ledgerCapped: position.capped,
  });

  return { auditId: ref.id, expectedAmount, difference };
}

/**
 * Audit financier agence (lecture seule) :
 * - compare sessions fermées, transactions et caisse compte agence.
 * - n'écrit aucune donnée.
 */
export async function runAgencyFinancialAudit(
  companyId: string,
  agencyId: string
): Promise<AgencyFinancialAuditResult> {
  console.group(`[AgencyFinancialAudit] ${companyId}/${agencyId}`);
  console.info("[1/4] Chargement sessions fermées...");

  const sessions: Array<{ id: string; totalExpected: number; totalDeclared: number; status: string }> = [];
  let sessionsCursor: QueryDocumentSnapshot<DocumentData> | undefined;
  let sessionsCapped = false;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const snap = await getDocs(
        query(
          sessionsRef(companyId, agencyId),
          where("status", "in", [...CLOSED_SESSION_STATUSES]),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
          ...(sessionsCursor ? [startAfter(sessionsCursor)] : [])
        )
      );
      if (snap.empty) break;
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        sessions.push({
          id: d.id,
          totalExpected: Number(x.totalExpected ?? 0),
          totalDeclared: Number(x.totalDeclared ?? 0),
          status: String(x.status ?? ""),
        });
      }
      sessionsCursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) sessionsCapped = true;
    }
  } catch (error) {
    console.warn("[AgencyFinancialAudit] Query sessions fermées indisponible, fallback lecture large.", error);
    for (let page = 0; page < MAX_PAGES; page++) {
      const snap = await getDocs(
        query(
          sessionsRef(companyId, agencyId),
          orderBy("createdAt", "desc"),
          limit(PAGE_SIZE),
          ...(sessionsCursor ? [startAfter(sessionsCursor)] : [])
        )
      );
      if (snap.empty) break;
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>;
        const status = String(x.status ?? "");
        if (!CLOSED_SESSION_STATUSES.includes(status as (typeof CLOSED_SESSION_STATUSES)[number])) continue;
        sessions.push({
          id: d.id,
          totalExpected: Number(x.totalExpected ?? 0),
          totalDeclared: Number(x.totalDeclared ?? 0),
          status,
        });
      }
      sessionsCursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) sessionsCapped = true;
    }
  }

  const totalVentes = sessions.reduce((sum, s) => sum + s.totalExpected, 0);
  const totalDeclare = sessions.reduce((sum, s) => sum + s.totalDeclared, 0);
  const sessionsWithGap: AgencySessionAuditRow[] = sessions
    .map((s) => {
      const ecart = s.totalDeclared - s.totalExpected;
      return {
        sessionId: s.id,
        totalExpected: s.totalExpected,
        totalDeclared: s.totalDeclared,
        ecart,
        status: s.status,
        anomaly: Math.abs(ecart) > 0.001,
      };
    })
    .filter((s) => s.anomaly);

  console.info("[2/4] Chargement financialTransactions type=sale...");
  const txRows: Array<FinancialTransactionDoc & { id: string }> = [];
  let txCursor: QueryDocumentSnapshot<DocumentData> | undefined;
  let txCapped = false;

  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const snap = await getDocs(
        query(
          financialTransactionsRef(companyId),
          where("agencyId", "==", agencyId),
          where("type", "==", "sale"),
          orderBy("performedAt", "desc"),
          limit(PAGE_SIZE),
          ...(txCursor ? [startAfter(txCursor)] : [])
        )
      );
      if (snap.empty) break;
      snap.docs.forEach((d) => txRows.push({ id: d.id, ...(d.data() as FinancialTransactionDoc) }));
      txCursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) txCapped = true;
    }
  } catch (error) {
    console.warn(
      "[AgencyFinancialAudit] Query type=sale indisponible, fallback vers payment_received confirmé.",
      error
    );
    for (let page = 0; page < MAX_PAGES; page++) {
      const snap = await getDocs(
        query(
          financialTransactionsRef(companyId),
          where("agencyId", "==", agencyId),
          where("type", "==", "payment_received"),
          orderBy("performedAt", "desc"),
          limit(PAGE_SIZE),
          ...(txCursor ? [startAfter(txCursor)] : [])
        )
      );
      if (snap.empty) break;
      snap.docs.forEach((d) => txRows.push({ id: d.id, ...(d.data() as FinancialTransactionDoc) }));
      txCursor = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) txCapped = true;
    }
  }

  const totalTransactions = txRows.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  console.info("[3/4] Chargement compte caisse agence...");
  const cashAccountSnap = await getDocs(
    query(
      accountsRef(companyId),
      where("agencyId", "==", agencyId),
      where("accountType", "==", "agency_cash"),
      limit(1)
    )
  );
  const missingCashAccount = cashAccountSnap.empty;
  const totalCaisse = missingCashAccount
    ? 0
    : Number((cashAccountSnap.docs[0].data() as { balance?: number; currentBalance?: number }).balance ??
        (cashAccountSnap.docs[0].data() as { currentBalance?: number }).currentBalance ??
        0);

  const ecartVenteDeclare = totalDeclare - totalVentes;
  const ecartDeclareCaisse = totalCaisse - totalDeclare;

  const anomalies: string[] = [];
  if (missingCashAccount) anomalies.push("Compte caisse agence introuvable.");
  if (Math.abs(ecartVenteDeclare) > 0.001) anomalies.push("Ecart entre ventes théoriques et montants déclarés.");
  if (Math.abs(ecartDeclareCaisse) > 0.001) anomalies.push("Ecart entre montants déclarés et solde caisse.");
  if (sessionsWithGap.length > 0) anomalies.push(`${sessionsWithGap.length} session(s) présentent un écart individuel.`);

  const status: "OK" | "INCOHERENT" = anomalies.length === 0 ? "OK" : "INCOHERENT";

  console.info("[4/4] Résultat audit:", {
    agencyId,
    totalVentes,
    totalDeclare,
    totalTransactions,
    totalCaisse,
    ecartVenteDeclare,
    ecartDeclareCaisse,
    sessionsCount: sessions.length,
    sessionsWithGap: sessionsWithGap.length,
    status,
  });
  console.groupEnd();

  return {
    agencyId,
    totalVentes,
    totalDeclare,
    totalCaisse,
    totalTransactions,
    ecartVenteDeclare,
    ecartDeclareCaisse,
    status,
    sessionsWithGap,
    anomalies,
    meta: {
      sessionsCount: sessions.length,
      transactionsCount: txRows.length,
      missingCashAccount,
      capped: sessionsCapped || txCapped,
    },
  };
}
