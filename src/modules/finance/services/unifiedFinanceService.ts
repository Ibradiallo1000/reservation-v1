/**
 * Service financier unifié TELIYA — 3 niveaux : temps réel (live), encaissements (cash), revenus validés (validated).
 * Source de vérité : Ventes → reservations (createdAt), Encaissements → cashTransactions (paidAt, liées à réservation),
 * Revenus validés → reservations (validatedAt). dailyStats = vue dérivée (conservée pour historique).
 */

import { collectionGroup, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { isSoldReservation } from "@/modules/compagnie/networkStats/networkStatsService";
import { getCashTransactionsByPaidAtRange, getCashTransactionsByDateRange } from "@/modules/compagnie/cash/cashService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import {
  getTotalSales,
  getTotalCash,
  getValidatedRevenue,
  type FinancialPeriod,
} from "./financialConsistencyService";

const PAID_PAYMENT_STATUSES = ["PAID_ORIGIN", "PAID_DESTINATION"];

function isPaidShipment(status: string | undefined): boolean {
  return status != null && PAID_PAYMENT_STATUSES.includes(status);
}

export interface UnifiedAgencyFinance {
  live: {
    tickets: number;
    courier: number;
    /** Revenus billets (reservations vendues). */
    liveTicketsRevenue: number;
    /** Revenus courrier (shipments payés). */
    liveCourierRevenue: number;
    /** liveTicketsRevenue + liveCourierRevenue */
    totalRevenue: number;
  };
  cash: {
    /** Encaissements (transactions paid liées à une réservation valide). */
    total: number;
    /** Montant des transactions orphelines (non inclus dans total). */
    orphanAmount?: number;
  };
  validated: {
    totalRevenue: number;
    /** Revenus validés par le comptable agence (ticketRevenueAgency + courierRevenueAgency). */
    validatedAgency: number;
    /** Revenus validés par le chef comptable (ticketRevenueCompany + courierRevenueCompany). */
    validatedCompany: number;
  };
}

/**
 * Calcule les 3 niveaux financiers pour une agence sur une plage de dates.
 * - live : reservations (createdAt, isSoldReservation) + shipments payés
 * - cash : cashTransactions paidAt, status paid, liées à une réservation valide (hors orphelines)
 * - validated : reservations (validatedAt) + dailyStats courier (dérivé)
 */
export async function getUnifiedAgencyFinance(
  companyId: string,
  agencyId: string,
  dateFrom: string,
  dateTo: string
): Promise<UnifiedAgencyFinance> {
  const period: FinancialPeriod = { dateFrom, dateTo };
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const [salesRes, cashRes, validatedRes, shipmentsSnap, dailyStatsSnap] = await Promise.all([
    getTotalSales(companyId, period, agencyId),
    getTotalCash(companyId, period, { agencyId, includeOrphans: false }),
    getValidatedRevenue(companyId, period, agencyId),
    getDocs(
      query(
        shipmentsRef(db, companyId),
        where("originAgencyId", "==", agencyId),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    ),
    getDocs(
      query(
        collectionGroup(db, "dailyStats"),
        where("companyId", "==", companyId),
        where("agencyId", "==", agencyId),
        where("date", ">=", dateFrom),
        where("date", "<=", dateTo),
        limit(500)
      )
    ),
  ]);

  let liveCourierRevenue = 0;
  shipmentsSnap.docs.forEach((d) => {
    const s = d.data() as { paymentStatus?: string; transportFee?: number; insuranceAmount?: number };
    if (isPaidShipment(s.paymentStatus)) {
      liveCourierRevenue += Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
    }
  });

  let validatedCourierFromStats = 0;
  let validatedAgencySum = 0;
  let validatedCompanySum = 0;
  dailyStatsSnap.docs.forEach((d) => {
    const data = d.data();
    validatedCourierFromStats += Number(data.courierRevenue ?? 0);
    validatedAgencySum += Number(data.ticketRevenueAgency ?? 0) + Number(data.courierRevenueAgency ?? 0);
    validatedCompanySum += Number(data.ticketRevenueCompany ?? 0) + Number(data.courierRevenueCompany ?? 0);
  });

  const validatedTotal = validatedRes.total + validatedCourierFromStats;
  const liveTotalRevenue = salesRes.total + liveCourierRevenue;

  const result: UnifiedAgencyFinance = {
    live: {
      tickets: salesRes.tickets,
      courier: liveCourierRevenue,
      liveTicketsRevenue: salesRes.total,
      liveCourierRevenue,
      totalRevenue: liveTotalRevenue,
    },
    cash: { total: cashRes.total, orphanAmount: cashRes.orphanAmount },
    validated: {
      totalRevenue: validatedTotal,
      validatedAgency: validatedAgencySum,
      validatedCompany: validatedCompanySum,
    },
  };

  if (typeof console !== "undefined" && console.log) {
    console.log("[unifiedFinanceService] getUnifiedAgencyFinance", {
      source: "reservations + cashTransactions(paidAt) + validatedAt + dailyStats(courier)",
      companyId,
      agencyId,
      dateFrom,
      dateTo,
      live: result.live,
      cash: result.cash,
      validated: result.validated,
    });
  }

  return result;
}

/**
 * Agrège les 3 niveaux financiers au niveau compagnie (toutes agences).
 * Même logique de source de vérité : createdAt (ventes), paidAt (encaissements liés), validatedAt (validé).
 */
export async function getUnifiedCompanyFinance(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<UnifiedAgencyFinance> {
  const period: FinancialPeriod = { dateFrom, dateTo };
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const [salesRes, cashRes, validatedRes, shipmentsSnap, dailyStatsSnap] = await Promise.all([
    getTotalSales(companyId, period),
    getTotalCash(companyId, period, { includeOrphans: false }),
    getValidatedRevenue(companyId, period),
    getDocs(
      query(
        shipmentsRef(db, companyId),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    ),
    getDocs(
      query(
        collectionGroup(db, "dailyStats"),
        where("companyId", "==", companyId),
        where("date", ">=", dateFrom),
        where("date", "<=", dateTo),
        limit(2000)
      )
    ),
  ]);

  let liveCourierRevenue = 0;
  shipmentsSnap.docs.forEach((d) => {
    const s = d.data() as { paymentStatus?: string; transportFee?: number; insuranceAmount?: number };
    if (isPaidShipment(s.paymentStatus)) {
      liveCourierRevenue += Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
    }
  });

  let validatedCourierFromStats = 0;
  let validatedAgencySum = 0;
  let validatedCompanySum = 0;
  dailyStatsSnap.docs.forEach((d) => {
    const data = d.data();
    validatedCourierFromStats += Number(data.courierRevenue ?? 0);
    validatedAgencySum += Number(data.ticketRevenueAgency ?? 0) + Number(data.courierRevenueAgency ?? 0);
    validatedCompanySum += Number(data.ticketRevenueCompany ?? 0) + Number(data.courierRevenueCompany ?? 0);
  });

  const validatedTotal = validatedRes.total + validatedCourierFromStats;
  const liveTotalRevenue = salesRes.total + liveCourierRevenue;

  const result: UnifiedAgencyFinance = {
    live: {
      tickets: salesRes.tickets,
      courier: liveCourierRevenue,
      liveTicketsRevenue: salesRes.total,
      liveCourierRevenue,
      totalRevenue: liveTotalRevenue,
    },
    cash: { total: cashRes.total, orphanAmount: cashRes.orphanAmount },
    validated: {
      totalRevenue: validatedTotal,
      validatedAgency: validatedAgencySum,
      validatedCompany: validatedCompanySum,
    },
  };

  if (typeof console !== "undefined" && console.log) {
    console.log("[unifiedFinanceService] getUnifiedCompanyFinance", {
      source: "reservations + cashTransactions(paidAt) + validatedAt + dailyStats(courier)",
      companyId,
      dateFrom,
      dateTo,
      live: result.live,
      cash: result.cash,
      validated: result.validated,
    });
  }

  return result;
}
