/**
 * Comptes ledger — soldes agrégés (companies/{companyId}/accounts).
 * Mis à jour via createFinancialTransaction / financialTransactions (source de vérité affichée sur les dashboards financiers).
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { isLiquidityBucketType, parseStrictLedgerAccountType } from "./ledgerAccountStrictTypes";

export const LEDGER_ACCOUNTS_COLLECTION = "accounts";

export type LedgerAccountKind = "cash" | "mobile_money" | "bank" | "virtual_clearing" | "virtual_client";

export interface LedgerAccountDoc {
  id: string;
  companyId: string;
  agencyId: string | null;
  type: LedgerAccountKind;
  label: string;
  balance: number;
  currency: string;
  /** Si false, exclu de SUM(liquidité) mais nécessaire à la partie double. */
  includeInLiquidity: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

function safeSegment(id: string): string {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Banque compagnie (un seul compte). */
export function companyBankAccountDocId(): string {
  return "company_bank";
}

/** Compte virtuel : contrepartie entrées de trésorerie (partie double). */
export function companyClearingAccountDocId(): string {
  return "company_clearing";
}

/** Compte virtuel client (remboursements). */
export function companyClientVirtualAccountDocId(): string {
  return "company_client";
}

export function agencyCashAccountDocId(agencyId: string): string {
  return `agency_${safeSegment(agencyId)}_cash`;
}

/**
 * Contrepartie ventes guichet/courrier espèces avant remise physique validée par le comptable.
 * `type: virtual_clearing`, exclu des agrégats liquidité — la caisse réelle n'augmente qu'à la remise.
 */
export function agencyPendingCashAccountDocId(agencyId: string): string {
  return `agency_${safeSegment(agencyId)}_pending_cash`;
}

export function agencyMobileMoneyAccountDocId(agencyId: string): string {
  return `agency_${safeSegment(agencyId)}_mobile_money`;
}

export function ledgerAccountsRef(companyId: string) {
  return collection(db, "companies", companyId, LEDGER_ACCOUNTS_COLLECTION);
}

export function ledgerAccountDocRef(companyId: string, accountDocId: string) {
  return doc(db, "companies", companyId, LEDGER_ACCOUNTS_COLLECTION, accountDocId);
}

function includeInLiquiditySum(raw: Record<string, unknown>): boolean {
  return raw.includeInLiquidity !== false;
}

/**
 * Liquidité = SUM(balance) sur `accounts` uniquement, champ `type` strict (cash | mobile_money | bank).
 * Aucune inférence depuis doc id ou accountType — exécuter `normalizeAccountsData` si erreur.
 */
export async function getLiquidityFromAccounts(
  companyId: string,
  agencyId?: string
): Promise<{
  cash: number;
  mobileMoney: number;
  bank: number;
  total: number;
}> {
  const snap = await getDocs(query(ledgerAccountsRef(companyId), limit(500)));
  let cash = 0;
  let mobileMoney = 0;
  let bank = 0;

  snap.docs.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    const accType = parseStrictLedgerAccountType(raw, d.id);
    if (!isLiquidityBucketType(accType)) return;
    if (!includeInLiquiditySum(raw)) return;

    const bal = Number(raw.balance ?? 0) || 0;
    const docAgency = (raw.agencyId as string | null | undefined) ?? null;

    if (agencyId) {
      if (accType === "bank") return;
      if (docAgency !== agencyId) return;
    }

    if (accType === "cash") cash += bal;
    else if (accType === "mobile_money") mobileMoney += bal;
    else if (accType === "bank") bank += bal;
  });

  return { cash, mobileMoney, bank, total: cash + mobileMoney + bank };
}

/**
 * Soldes caisse / mobile money par agence — uniquement via `agencyId` + `type` sur chaque document.
 */
export async function getAgencyLedgerLiquidityMap(
  companyId: string,
  agencyIds: string[]
): Promise<Record<string, { cash: number; mobileMoney: number }>> {
  const out: Record<string, { cash: number; mobileMoney: number }> = {};
  agencyIds.forEach((id) => {
    out[id] = { cash: 0, mobileMoney: 0 };
  });

  const snap = await getDocs(query(ledgerAccountsRef(companyId), limit(500)));
  snap.docs.forEach((d) => {
    const raw = d.data() as Record<string, unknown>;
    const accType = parseStrictLedgerAccountType(raw, d.id);
    if (!includeInLiquiditySum(raw)) return;
    if (accType !== "cash" && accType !== "mobile_money") return;

    const aid = (raw.agencyId as string | null | undefined) ?? null;
    if (!aid || !out[aid]) return;

    const bal = Number(raw.balance ?? 0) || 0;
    if (accType === "cash") out[aid].cash += bal;
    else out[aid].mobileMoney += bal;
  });

  return out;
}

export function initialLedgerAccountPayload(params: {
  id: string;
  companyId: string;
  agencyId: string | null;
  type: LedgerAccountKind;
  label: string;
  currency: string;
  includeInLiquidity: boolean;
}): Omit<LedgerAccountDoc, "createdAt" | "updatedAt"> & { createdAt: ReturnType<typeof serverTimestamp>; updatedAt: ReturnType<typeof serverTimestamp> } {
  return {
    id: params.id,
    companyId: params.companyId,
    agencyId: params.agencyId,
    type: params.type,
    label: params.label,
    balance: 0,
    currency: params.currency,
    includeInLiquidity: params.includeInLiquidity,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/** Crée les docs manquants (phase écriture transaction). */
export function ensureLedgerAccountDocsInTransaction(
  tx: Transaction,
  companyId: string,
  currency: string,
  specs: Array<{ docId: string; type: LedgerAccountKind; agencyId: string | null; label: string; includeInLiquidity: boolean }>,
  existingFlags: boolean[]
): void {
  specs.forEach((spec, i) => {
    if (existingFlags[i]) return;
    const ref = ledgerAccountDocRef(companyId, spec.docId);
    tx.set(
      ref,
      initialLedgerAccountPayload({
        id: spec.docId,
        companyId,
        agencyId: spec.agencyId,
        type: spec.type,
        label: spec.label,
        currency,
        includeInLiquidity: spec.includeInLiquidity,
      })
    );
  });
}

/** Métadonnées compte pour création initiale (partie double). */
export function specForLedgerDocId(accountDocId: string, agencyIdForAgencyAccounts: string | null): {
  type: LedgerAccountKind;
  agencyId: string | null;
  label: string;
  includeInLiquidity: boolean;
} {
  if (accountDocId === companyClearingAccountDocId()) {
    return { type: "virtual_clearing", agencyId: null, label: "Compensation entrées", includeInLiquidity: false };
  }
  if (accountDocId === companyClientVirtualAccountDocId()) {
    return { type: "virtual_client", agencyId: null, label: "Clients (virtuel)", includeInLiquidity: false };
  }
  if (accountDocId === companyBankAccountDocId()) {
    return { type: "bank", agencyId: null, label: "Banque compagnie", includeInLiquidity: true };
  }
  if (accountDocId === "company_mobile_money") {
    return { type: "mobile_money", agencyId: null, label: "Mobile money (compagnie)", includeInLiquidity: true };
  }
  if (accountDocId.includes("_pending_cash")) {
    return {
      type: "virtual_clearing",
      agencyId: agencyIdForAgencyAccounts,
      label: "Caisse agence — en attente de remise",
      includeInLiquidity: false,
    };
  }
  if (accountDocId.includes("mobile_money")) {
    return {
      type: "mobile_money",
      agencyId: agencyIdForAgencyAccounts,
      label: "Mobile money agence",
      includeInLiquidity: true,
    };
  }
  if (accountDocId.includes("_cash") || accountDocId === "cash") {
    return {
      type: "cash",
      agencyId: agencyIdForAgencyAccounts,
      label: "Caisse physique agence",
      includeInLiquidity: true,
    };
  }
  return { type: "bank", agencyId: null, label: accountDocId, includeInLiquidity: true };
}

/** Pont comptes financiers (financialAccounts) → doc id ledger `accounts`. */
export function ledgerDocIdFromFinancialAccountData(data: {
  accountType?: string | null;
  agencyId?: string | null;
}): string | null {
  const t = String(data.accountType ?? "");
  const aid = data.agencyId ?? null;
  if (t === "agency_cash" && aid) return agencyCashAccountDocId(aid);
  if (t === "company_bank") return companyBankAccountDocId();
  if (t === "company_mobile_money" || t === "mobile_money") {
    if (aid) return agencyMobileMoneyAccountDocId(aid);
    return "company_mobile_money";
  }
  return null;
}
