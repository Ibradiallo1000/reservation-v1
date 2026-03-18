/**
 * Cohérence financière TELIYA — source de vérité et détection d'écarts.
 * Règles : Ventes → createdAt (reservations), Encaissements → paidAt (cashTransactions liées),
 * Revenus validés → validatedAt (reservations). dailyStats = vue dérivée uniquement.
 */

import { collectionGroup, query, where, getDocs, orderBy, limit, Timestamp, doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { isSoldReservation } from "@/modules/compagnie/networkStats/networkStatsService";
import {
  getCashTransactionsByPaidAtRange,
  getCashTransactionsByDateRange,
  type CashTransactionDocWithId,
} from "@/modules/compagnie/cash/cashService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";

export interface FinancialPeriod {
  dateFrom: string;
  dateTo: string;
}

/**
 * Ventes totales (source : réservations vendues, filtrées par createdAt).
 */
export async function getTotalSales(
  companyId: string,
  period: FinancialPeriod,
  agencyId?: string
): Promise<{ total: number; tickets: number }> {
  const periodStart = getStartOfDayInBamako(period.dateFrom);
  const periodEnd = getEndOfDayInBamako(period.dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const constraints = [
    where("companyId", "==", companyId),
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "asc"),
    limit(5000),
  ];
  if (agencyId) {
    (constraints as unknown[]).unshift(where("agencyId", "==", agencyId));
  }
  const q = query(collectionGroup(db, "reservations"), ...constraints);
  const snap = await getDocs(q);
  let total = 0;
  let tickets = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    const statut = (data.statut ?? data.status ?? "").toString();
    if (isSoldReservation(statut)) {
      tickets += 1;
      total += Number(data.montant ?? data.amount ?? 0) || 0;
    }
  });
  return { total, tickets };
}

export interface TotalCashResult {
  total: number;
  orphanAmount: number;
  orphanCount: number;
  orphanTransactions: Array<{ id: string; reservationId: string; amount: number; locationId: string }>;
}

/**
 * Encaissements (source : cashTransactions paid, par paidAt, uniquement celles liées à une réservation valide).
 * Si includeOrphans = false (défaut), n'inclut que les transactions dont la réservation existe et est vendue.
 */
export async function getTotalCash(
  companyId: string,
  period: FinancialPeriod,
  options: { agencyId?: string; includeOrphans?: boolean } = {}
): Promise<TotalCashResult> {
  const { agencyId, includeOrphans = false } = options;

  let list: CashTransactionDocWithId[];
  try {
    list = await getCashTransactionsByPaidAtRange(companyId, period.dateFrom, period.dateTo);
  } catch {
    list = await getCashTransactionsByDateRange(companyId, period.dateFrom, period.dateTo);
  }

  const paid = list.filter((t) => (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID);
  const empty: TotalCashResult = { total: 0, orphanAmount: 0, orphanCount: 0, orphanTransactions: [] };
  if (paid.length === 0) return empty;

  const refs = paid.map((t) =>
    doc(db, "companies", companyId, "agences", (t.locationId ?? "") || "unknown", "reservations", t.reservationId)
  );
  const chunks: ReturnType<typeof doc>[][] = [];
  for (let i = 0; i < refs.length; i += 30) {
    chunks.push(refs.slice(i, i + 30));
  }

  const existsAndSold = new Set<string>();
  for (const chunk of chunks) {
    const results = await Promise.all(chunk.map((r) => getDoc(r)));
    results.forEach((snap, idx) => {
      const r = chunk[idx];
      if (!r) return;
      if (snap.exists()) {
        const data = snap.data();
        const statut = (data.statut ?? data.status ?? "").toString();
        if (isSoldReservation(statut)) existsAndSold.add(r.path);
      }
    });
  }

  let total = 0;
  const orphanTransactions: TotalCashResult["orphanTransactions"] = [];
  paid.forEach((t) => {
    const refPath = `companies/${companyId}/agences/${t.locationId ?? ""}/reservations/${t.reservationId}`;
    const valid = existsAndSold.has(refPath);
    const amount = Number(t.amount) || 0;
    const txId = (t as CashTransactionDocWithId & { id: string }).id;
    if (valid) {
      if (!agencyId || t.locationId === agencyId) total += amount;
    } else {
      orphanTransactions.push({
        id: txId,
        reservationId: t.reservationId,
        amount,
        locationId: t.locationId ?? "",
      });
    }
  });

  const orphanAmount = orphanTransactions.reduce((s, o) => s + o.amount, 0);
  const orphanCount = orphanTransactions.length;
  if (includeOrphans) total += orphanAmount;
  return { total, orphanAmount, orphanCount, orphanTransactions };
}

/**
 * Revenus validés (source : réservations avec validatedAt dans la période).
 */
export async function getValidatedRevenue(
  companyId: string,
  period: FinancialPeriod,
  agencyId?: string
): Promise<{ total: number; tickets: number }> {
  const periodStart = getStartOfDayInBamako(period.dateFrom);
  const periodEnd = getEndOfDayInBamako(period.dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const constraints = [
    where("companyId", "==", companyId),
    where("validatedAt", ">=", startTs),
    where("validatedAt", "<=", endTs),
    orderBy("validatedAt", "asc"),
    limit(5000),
  ];
  if (agencyId) {
    (constraints as unknown[]).unshift(where("agencyId", "==", agencyId));
  }
  const q = query(collectionGroup(db, "reservations"), ...constraints);
  const snap = await getDocs(q);
  let total = 0;
  let tickets = 0;
  snap.docs.forEach((d) => {
    const data = d.data();
    total += Number(data.montant ?? data.amount ?? 0) || 0;
    tickets += 1;
  });
  return { total, tickets };
}

export interface FinancialInconsistencies {
  orphanTransactions: Array<{ id: string; reservationId: string; amount: number; locationId: string }>;
  missingTransactions: Array<{ reservationId: string; agencyId: string; montant: number }>;
  mismatchAmount: number;
  salesTotal: number;
  cashTotal: number;
  cashOrphanAmount: number;
}

/**
 * Détecte les incohérences : transactions orphelines, réservations vendues sans encaissement, écart encaissements > ventes.
 */
export async function detectFinancialInconsistencies(
  companyId: string,
  period: FinancialPeriod
): Promise<FinancialInconsistencies> {
  const periodStart = getStartOfDayInBamako(period.dateFrom);
  const periodEnd = getEndOfDayInBamako(period.dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const [salesRes, cashRes, reservationsSnap, cashList] = await Promise.all([
    getTotalSales(companyId, period),
    getTotalCash(companyId, period, { includeOrphans: false }),
    getDocs(
      query(
        collectionGroup(db, "reservations"),
        where("companyId", "==", companyId),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    ),
    getCashTransactionsByPaidAtRange(companyId, period.dateFrom, period.dateTo).catch(() =>
      getCashTransactionsByDateRange(companyId, period.dateFrom, period.dateTo)
    ),
  ]);

  const soldReservations = reservationsSnap.docs.filter((d) => {
    const data = d.data();
    return isSoldReservation((data.statut ?? data.status ?? "").toString());
  });

  const paidCash = cashList.filter((t) => (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID);
  const reservationIdsWithCash = new Set(
    paidCash.map((t) => `${t.locationId ?? ""}:${t.reservationId}`)
  );
  const missingTransactions: FinancialInconsistencies["missingTransactions"] = [];
  soldReservations.forEach((d) => {
    const data = d.data();
    const agencyId = (data.agencyId ?? data.agenceId ?? "").toString();
    const reservationId = d.id;
    const key = `${agencyId}:${reservationId}`;
    if (!reservationIdsWithCash.has(key) && (Number(data.montant ?? data.amount ?? 0) || 0) > 0) {
      missingTransactions.push({
        reservationId,
        agencyId,
        montant: Number(data.montant ?? data.amount ?? 0) || 0,
      });
    }
  });

  const cashTotalWithOrphans = cashRes.total + cashRes.orphanAmount;
  const mismatchAmount = Math.max(0, cashTotalWithOrphans - salesRes.total);

  return {
    orphanTransactions: cashRes.orphanTransactions,
    missingTransactions,
    mismatchAmount: cashRes.orphanAmount + mismatchAmount,
    salesTotal: salesRes.total,
    cashTotal: cashRes.total,
    cashOrphanAmount: cashRes.orphanAmount,
  };
}
