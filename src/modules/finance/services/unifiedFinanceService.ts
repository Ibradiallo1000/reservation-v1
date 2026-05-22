import { Timestamp } from "firebase/firestore";
import { getNetworkSales, type FinancialPeriod } from "./financialConsistencyService";
import {
  getLedgerBalances,
  listFinancialTransactionsByPeriod,
  isConfirmedTransactionStatus,
} from "@/modules/compagnie/treasury/financialTransactions";
import {
  DEFAULT_AGENCY_TIMEZONE,
  getEndOfDayForDate,
  getStartOfDayForDate,
} from "@/shared/date/dateUtilsTz";

/** Argent réel = uniquement somme des soldes `accounts` (ledger). */
export interface UnifiedRealMoney {
  cash: number;
  mobileMoney: number;
  bank: number;
  total: number;
}

/** Activité période = ventes (réservations) + mouvements `financialTransactions` (hors solde comptes). */
export interface UnifiedActivity {
  sales: { reservationCount: number; tickets: number; amountHint: number };
  encaissements: { total: number };
  deposits: { total: number };
  expenses: { total: number };
  financialGap: number;
  caNet: number;
  split: { paiementsEnLigne: number; paiementsGuichet: number };
}

export interface UnifiedAgencyFinance {
  realMoney: UnifiedRealMoney;
  activity: UnifiedActivity;
}

function normalizeTxType(t: string | undefined): string {
  if (t === "transfer_to_bank") return "transfer";
  return String(t ?? "");
}

function isPaymentReceived(row: { type?: string }): boolean {
  return normalizeTxType(row.type) === "payment_received";
}

function isRefund(row: { type?: string }): boolean {
  return normalizeTxType(row.type) === "refund";
}

function sumDeposits(rows: Array<{ type?: string; amount?: number; status?: string; referenceType?: string }>): number {
  return rows.reduce((sum, r) => {
    if (!isConfirmedTransactionStatus(r.status as any)) return sum;
    if (normalizeTxType(r.type) !== "transfer") return sum;
    const ref = String(r.referenceType ?? "");
    if (ref !== "agency_deposit" && ref !== "mobile_to_bank" && ref !== "deposit") return sum;
    return sum + Math.max(0, Number(r.amount) || 0);
  }, 0);
}

function sumExpenses(rows: Array<{ type?: string; amount?: number; status?: string }>): number {
  return rows.reduce((sum, r) => {
    if (!isConfirmedTransactionStatus(r.status as any)) return sum;
    if (normalizeTxType(r.type) !== "expense") return sum;
    return sum + Math.abs(Number(r.amount) || 0);
  }, 0);
}

function splitEncaissementsByPaymentMethod(
  rows: Array<{ type?: string; amount?: number; status?: string; paymentMethod?: string | null }>
) {
  let total = 0;
  let online = 0;
  let guichet = 0;
  rows.forEach((r) => {
    if (!isPaymentReceived(r) || !isConfirmedTransactionStatus(r.status as any)) return;
    const amount = Number(r.amount) || 0;
    total += amount;
    const pm = String(r.paymentMethod ?? "").toLowerCase();
    if (pm === "cash") guichet += amount;
    else if (pm === "mobile_money" || pm === "card") online += amount;
    else {
      console.error(
        "[unifiedFinance] payment_method_manquant_ou_invalide sur payment_received confirmé — exécuter migration transactions / corriger données.",
        r
      );
    }
  });
  return { total, online, guichet };
}

function sumCaNet(rows: Array<{ type?: string; amount?: number; status?: string }>): number {
  let received = 0;
  let refunds = 0;
  rows.forEach((r) => {
    if (!isConfirmedTransactionStatus(r.status as any)) return;
    const amount = Number(r.amount) || 0;
    if (isPaymentReceived(r)) received += Math.max(0, amount);
    if (isRefund(r)) refunds += Math.abs(amount);
  });
  return received - refunds;
}

export async function getUnifiedAgencyFinance(
  companyId: string,
  agencyId: string,
  dateFrom: string,
  dateTo: string,
  timeZone: string = DEFAULT_AGENCY_TIMEZONE
): Promise<UnifiedAgencyFinance> {
  const period: FinancialPeriod = { dateFrom, dateTo };
  const start = Timestamp.fromDate(getStartOfDayForDate(period.dateFrom, timeZone));
  const end = Timestamp.fromDate(getEndOfDayForDate(period.dateTo, timeZone));

  const [sales, txRows, liquidity] = await Promise.all([
    getNetworkSales(companyId, period, agencyId, timeZone),
    listFinancialTransactionsByPeriod(companyId, start, end, agencyId),
    getLedgerBalances(companyId, agencyId),
  ]);

  const enc = splitEncaissementsByPaymentMethod(txRows as any);
  const net = sumCaNet(txRows as any);
  const deposits = sumDeposits(txRows as any);
  const expenses = sumExpenses(txRows as any);
  const financialGap = sales.total - deposits - expenses;

  return {
    realMoney: {
      cash: liquidity.cash,
      mobileMoney: liquidity.mobileMoney,
      bank: liquidity.bank,
      total: liquidity.total,
    },
    activity: {
      sales: {
        reservationCount: sales.reservationCount,
        tickets: sales.tickets,
        amountHint: sales.total,
      },
      encaissements: { total: enc.total },
      deposits: { total: deposits },
      expenses: { total: expenses },
      financialGap,
      caNet: net,
      split: { paiementsEnLigne: enc.online, paiementsGuichet: enc.guichet },
    },
  };
}

export async function getUnifiedCompanyFinance(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<UnifiedAgencyFinance> {
  const period: FinancialPeriod = { dateFrom, dateTo };
  const start = Timestamp.fromDate(getStartOfDayForDate(period.dateFrom, DEFAULT_AGENCY_TIMEZONE));
  const end = Timestamp.fromDate(getEndOfDayForDate(period.dateTo, DEFAULT_AGENCY_TIMEZONE));

  const [sales, txRows, liquidity] = await Promise.all([
    getNetworkSales(companyId, period, undefined, DEFAULT_AGENCY_TIMEZONE),
    listFinancialTransactionsByPeriod(companyId, start, end),
    getLedgerBalances(companyId),
  ]);

  const enc = splitEncaissementsByPaymentMethod(txRows as any);
  const net = sumCaNet(txRows as any);
  const deposits = sumDeposits(txRows as any);
  const expenses = sumExpenses(txRows as any);
  const financialGap = sales.total - deposits - expenses;

  return {
    realMoney: {
      cash: liquidity.cash,
      mobileMoney: liquidity.mobileMoney,
      bank: liquidity.bank,
      total: liquidity.total,
    },
    activity: {
      sales: {
        reservationCount: sales.reservationCount,
        tickets: sales.tickets,
        amountHint: sales.total,
      },
      encaissements: { total: enc.total },
      deposits: { total: deposits },
      expenses: { total: expenses },
      financialGap,
      caNet: net,
      split: { paiementsEnLigne: enc.online, paiementsGuichet: enc.guichet },
    },
  };
}

/** @deprecated Utiliser getUnifiedAgencyFinance / getUnifiedCompanyFinance */
export async function getSalesKpiFromReservations(
  companyId: string,
  period: FinancialPeriod,
  agencyId?: string,
  timeZone: string = DEFAULT_AGENCY_TIMEZONE
) {
  return getNetworkSales(companyId, period, agencyId, timeZone);
}
