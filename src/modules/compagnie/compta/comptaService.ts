/**
 * Module Comptabilité TELIYA — lecture des mouvements et calculs (Grand livre, Balance, Compte de résultat).
 * Utilise les comptes + journal ledger financialTransactions.
 */

import { Timestamp } from "firebase/firestore";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { listFinancialTransactionsByPeriod } from "@/modules/compagnie/treasury/financialTransactions";
import type { ComptaMovementRow, BalanceLine, CompteDeResultatData } from "./comptaTypes";

const MAX_MOVEMENTS = 2000;

/** Charge les mouvements financiers (optionnel: filtre par dates). */
export async function listMovements(
  companyId: string,
  options?: { dateFrom?: Date; dateTo?: Date; accountId?: string }
): Promise<ComptaMovementRow[]> {
  const start = options?.dateFrom ?? new Date(0);
  const end = options?.dateTo ?? new Date("2100-01-01T00:00:00.000Z");
  const tx = await listFinancialTransactionsByPeriod(
    companyId,
    Timestamp.fromDate(start),
    Timestamp.fromDate(end)
  );
  let rows: ComptaMovementRow[] = tx.slice(0, MAX_MOVEMENTS).map((d) => {
    const amountAbs = Math.abs(Number(d.amount ?? 0));
    return {
      id: d.id,
      performedAt: d.performedAt ?? Timestamp.now(),
      fromAccountId: d.debitAccountId ?? null,
      toAccountId: d.creditAccountId ?? null,
      amount: amountAbs,
      currency: String(d.currency ?? ""),
      movementType: String(d.type ?? ""),
      referenceType: String(d.referenceType ?? ""),
      referenceId: String(d.referenceId ?? ""),
      entryType: d.type === "payment_received" ? "credit" : "debit",
      agencyId: String(d.agencyId ?? ""),
      notes: (d.metadata?.notes as string | null | undefined) ?? null,
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

  const revenueTypes = ["payment_received"];
  const chargeTypes = ["expense", "refund"];

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
