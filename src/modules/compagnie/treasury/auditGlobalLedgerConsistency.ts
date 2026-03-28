/**
 * Audit global déterministe (lecture seule) : recalcule les soldes des comptes
 * agence (`accounts`) à partir de `financialTransactions` et compare aux soldes stockés.
 */

import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type CollectionReference,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialTransactionDoc, FinancialTransactionStatus } from "./types";
import {
  agencyCashAccountDocId,
  agencyMobileMoneyAccountDocId,
  agencyPendingCashAccountDocId,
  ledgerAccountsRef,
} from "./ledgerAccounts";

const FINANCIAL_TRANSACTIONS = "financialTransactions";
const DEFAULT_PAGE_SIZE = 400;
const MONEY_EPSILON = 0.02;

function financialTransactionsColl(companyId: string) {
  return collection(db, "companies", companyId, FINANCIAL_TRANSACTIONS);
}

/** Aligné sur `isConfirmedTransactionStatus` (évite import du module `financialTransactions`). */
function isConfirmedLedgerTxForAudit(s: FinancialTransactionStatus | undefined): boolean {
  if (!s) return true;
  if (s === "failed" || s === "pending" || s === "rejected") return false;
  if (s === "confirmed" || s === "received" || s === "verified" || s === "refunded") return true;
  return true;
}

function applyTransactionToFlows(flows: Map<string, number>, row: FinancialTransactionDoc): boolean {
  if (!isConfirmedLedgerTxForAudit(row.status)) return true;
  const amt = Number(row.amount) || 0;
  const mag = Math.abs(amt);
  if (mag <= 0) return true;
  const debit = String(row.debitAccountId ?? "").trim();
  const credit = String(row.creditAccountId ?? "").trim();
  if (!debit || !credit) return false;
  flows.set(debit, (flows.get(debit) ?? 0) - mag);
  flows.set(credit, (flows.get(credit) ?? 0) + mag);
  return true;
}

async function paginateByDocumentId(
  coll: CollectionReference,
  pageSize: number,
  onPage: (docs: QueryDocumentSnapshot[]) => void | Promise<void>
): Promise<void> {
  let last: DocumentSnapshot | undefined;
  for (;;) {
    const q = last
      ? query(coll, orderBy(documentId()), startAfter(last), limit(pageSize))
      : query(coll, orderBy(documentId()), limit(pageSize));
    const snap = await getDocs(q);
    if (snap.empty) break;
    await onPage(snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) break;
  }
}

/** Comptes agence : caisse physique, attente remise, mobile money (doc ids `accounts`). */
function isAgencyLiquidityLedgerDocId(docId: string): boolean {
  if (!docId.startsWith("agency_")) return false;
  if (docId.endsWith("_pending_cash")) return true;
  if (docId.endsWith("_mobile_money")) return true;
  if (docId.endsWith("_cash") && !docId.includes("_pending_")) return true;
  return false;
}

export type AgencyLedgerConsistencyStatus = "OK" | "MISMATCH";

export type AgencyLedgerConsistencyRow = {
  agencyId: string;
  cashDiff: number;
  pendingDiff: number;
  mobileMoneyDiff: number;
  status: AgencyLedgerConsistencyStatus;
};

export type GlobalLedgerConsistencyResult = {
  isConsistent: boolean;
  agencies: AgencyLedgerConsistencyRow[];
};

export type AuditGlobalLedgerConsistencyOptions = {
  /** Taille de page Firestore (défaut 400, max 500). */
  pageSize?: number;
};

/**
 * Compare, pour chaque agence concernée, les soldes `accounts` (ledger) aux flux cumulés
 * issus de `financialTransactions` confirmées. Lecture seule, pagination par `documentId`.
 */
export async function auditGlobalLedgerConsistency(
  companyId: string,
  options?: AuditGlobalLedgerConsistencyOptions
): Promise<GlobalLedgerConsistencyResult> {
  const pageSize = Math.min(500, Math.max(50, options?.pageSize ?? DEFAULT_PAGE_SIZE));
  const flows = new Map<string, number>();
  const agencyIdsFromTx = new Set<string>();

  await paginateByDocumentId(financialTransactionsColl(companyId), pageSize, (docs) => {
    for (const d of docs) {
      const row = d.data() as FinancialTransactionDoc;
      applyTransactionToFlows(flows, row);
      const aid = row.agencyId != null && String(row.agencyId).trim() !== "" ? String(row.agencyId) : null;
      if (aid) agencyIdsFromTx.add(aid);
    }
  });

  const balanceByDocId = new Map<string, number>();
  const agencyIdsFromAccounts = new Set<string>();

  await paginateByDocumentId(ledgerAccountsRef(companyId), pageSize, (docs) => {
    for (const d of docs) {
      if (!isAgencyLiquidityLedgerDocId(d.id)) continue;
      const raw = d.data() as Record<string, unknown>;
      const bal = Number(raw.balance ?? 0) || 0;
      balanceByDocId.set(d.id, bal);
      const aid = raw.agencyId != null && String(raw.agencyId).trim() !== "" ? String(raw.agencyId) : null;
      if (aid) agencyIdsFromAccounts.add(aid);
    }
  });

  const allAgencyIds = new Set<string>([...agencyIdsFromTx, ...agencyIdsFromAccounts]);
  const agencies: AgencyLedgerConsistencyRow[] = [];

  for (const agencyId of allAgencyIds) {
    const cashDocId = agencyCashAccountDocId(agencyId);
    const pendingDocId = agencyPendingCashAccountDocId(agencyId);
    const mobileDocId = agencyMobileMoneyAccountDocId(agencyId);

    const theoreticalCash = flows.get(cashDocId) ?? 0;
    const theoreticalPending = flows.get(pendingDocId) ?? 0;
    const theoreticalMobile = flows.get(mobileDocId) ?? 0;

    const actualCash = balanceByDocId.has(cashDocId) ? (balanceByDocId.get(cashDocId) ?? 0) : 0;
    const actualPending = balanceByDocId.has(pendingDocId) ? (balanceByDocId.get(pendingDocId) ?? 0) : 0;
    const actualMobile = balanceByDocId.has(mobileDocId) ? (balanceByDocId.get(mobileDocId) ?? 0) : 0;

    const cashDiff = actualCash - theoreticalCash;
    const pendingDiff = actualPending - theoreticalPending;
    const mobileMoneyDiff = actualMobile - theoreticalMobile;

    const ok =
      Math.abs(cashDiff) <= MONEY_EPSILON &&
      Math.abs(pendingDiff) <= MONEY_EPSILON &&
      Math.abs(mobileMoneyDiff) <= MONEY_EPSILON;

    agencies.push({
      agencyId,
      cashDiff,
      pendingDiff,
      mobileMoneyDiff,
      status: ok ? "OK" : "MISMATCH",
    });
  }

  agencies.sort((a, b) => a.agencyId.localeCompare(b.agencyId));

  return {
    isConsistent: agencies.every((a) => a.status === "OK"),
    agencies,
  };
}
