/**
 * Module Comptabilité TELIYA — lecture des mouvements et calculs (Grand livre, Balance, Compte de résultat).
 * Utilise les collections financialAccounts et financialMovements.
 */

import {
  collection,
  query,
  orderBy,
  getDocs,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import type { ComptaMovementRow, BalanceLine, CompteDeResultatData } from "./comptaTypes";

const MOVEMENTS_COLLECTION = "financialMovements";
const MAX_MOVEMENTS = 2000;

function movementsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${MOVEMENTS_COLLECTION}`);
}

/** Charge les mouvements financiers (optionnel: filtre par dates). */
export async function listMovements(
  companyId: string,
  options?: { dateFrom?: Date; dateTo?: Date; accountId?: string }
): Promise<ComptaMovementRow[]> {
  const constraints: Parameters<typeof query>[1][] = [orderBy("performedAt", "asc"), limit(MAX_MOVEMENTS)];
  if (options?.dateFrom) constraints.unshift(where("performedAt", ">=", Timestamp.fromDate(options.dateFrom)));
  if (options?.dateTo) constraints.unshift(where("performedAt", "<=", Timestamp.fromDate(options.dateTo)));

  const q = query(movementsRef(companyId), ...constraints);
  const snap = await getDocs(q);
  let rows: ComptaMovementRow[] = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      performedAt: data.performedAt ?? Timestamp.now(),
      fromAccountId: data.fromAccountId ?? null,
      toAccountId: data.toAccountId ?? null,
      amount: Number(data.amount ?? 0),
      currency: String(data.currency ?? ""),
      movementType: data.movementType ?? "",
      referenceType: data.referenceType ?? "",
      referenceId: data.referenceId ?? "",
      entryType: data.entryType === "credit" ? "credit" : "debit",
      agencyId: data.agencyId ?? "",
      notes: data.notes ?? null,
    };
  });

  if (options?.accountId) {
    const aid = options.accountId;
    rows = rows.filter((r) => r.fromAccountId === aid || r.toAccountId === aid);
  }
  return rows;
}

/** Construit les lignes de balance pour une période (solde début, débit, crédit, solde fin). */
export async function getBalanceForPeriod(
  companyId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<BalanceLine[]> {
  const [accounts, movements] = await Promise.all([
    listAccounts(companyId),
    listMovements(companyId, { dateFrom, dateTo }),
  ]);

  const accountMap = new Map(
    accounts.map((a) => [
      a.id,
      { accountName: a.accountName, accountType: a.accountType, agencyId: a.agencyId ?? null },
    ])
  );

  const movementsBefore = await listMovements(companyId, { dateTo: new Date(dateFrom.getTime() - 1) });
  const soldeDebutByAccount = new Map<string, number>();

  for (const m of movementsBefore) {
    const amt = m.amount;
    if (m.toAccountId) soldeDebutByAccount.set(m.toAccountId, (soldeDebutByAccount.get(m.toAccountId) ?? 0) + amt);
    if (m.fromAccountId) soldeDebutByAccount.set(m.fromAccountId, (soldeDebutByAccount.get(m.fromAccountId) ?? 0) - amt);
  }

  const debitByAccount = new Map<string, number>();
  const creditByAccount = new Map<string, number>();

  for (const m of movements) {
    const amt = m.amount;
    if (m.entryType === "debit") {
      const acc = m.fromAccountId ?? m.toAccountId;
      if (acc) debitByAccount.set(acc, (debitByAccount.get(acc) ?? 0) + amt);
    } else {
      const acc = m.toAccountId ?? m.fromAccountId;
      if (acc) creditByAccount.set(acc, (creditByAccount.get(acc) ?? 0) + amt);
    }
  }

  const lines: BalanceLine[] = [];
  const seen = new Set<string>();
  for (const a of accounts) {
    seen.add(a.id);
    const debut = soldeDebutByAccount.get(a.id) ?? 0;
    const debit = debitByAccount.get(a.id) ?? 0;
    const credit = creditByAccount.get(a.id) ?? 0;
    const fin = debut + credit - debit;
    lines.push({
      accountId: a.id,
      accountName: a.accountName,
      accountType: a.accountType,
      agencyId: a.agencyId ?? null,
      soldeDebut: debut,
      debit,
      credit,
      soldeFin: fin,
    });
  }
  for (const [accId, info] of accountMap) {
    if (seen.has(accId)) continue;
    const debut = soldeDebutByAccount.get(accId) ?? 0;
    const debit = debitByAccount.get(accId) ?? 0;
    const credit = creditByAccount.get(accId) ?? 0;
    lines.push({
      accountId: accId,
      accountName: (info as { accountName: string }).accountName,
      accountType: (info as { accountType: string }).accountType,
      agencyId: (info as { agencyId: string | null }).agencyId,
      soldeDebut: debut,
      debit,
      credit,
      soldeFin: debut + credit - debit,
    });
  }
  return lines.sort((a, b) => a.accountName.localeCompare(b.accountName));
}

/** Compte de résultat simplifié sur la période : revenus (revenue_*) - charges (expense_*, payable_*, etc.). */
export async function getCompteDeResultat(
  companyId: string,
  dateFrom: Date,
  dateTo: Date
): Promise<CompteDeResultatData> {
  const movements = await listMovements(companyId, { dateFrom, dateTo });

  const revenueTypes = ["revenue_cash", "revenue_online"];
  const chargeTypes = ["expense_payment", "payable_payment", "salary_payment"];

  const byTypeRevenus: Record<string, number> = {};
  const byTypeCharges: Record<string, number> = {};

  let totalRevenus = 0;
  let totalCharges = 0;

  for (const m of movements) {
    const amt = m.amount;
    if (revenueTypes.includes(m.movementType)) {
      byTypeRevenus[m.movementType] = (byTypeRevenus[m.movementType] ?? 0) + amt;
      totalRevenus += amt;
    } else if (chargeTypes.includes(m.movementType)) {
      byTypeCharges[m.movementType] = (byTypeCharges[m.movementType] ?? 0) + amt;
      totalCharges += amt;
    }
  }

  const label =
    dateFrom.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) +
    " → " +
    dateTo.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });

  return {
    period: { start: dateFrom, end: dateTo, label },
    revenus: { total: totalRevenus, byType: byTypeRevenus },
    charges: { total: totalCharges, byType: byTypeCharges },
    resultat: totalRevenus - totalCharges,
  };
}
