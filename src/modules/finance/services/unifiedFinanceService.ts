/**
 * Service financier unifié TELIYA — 3 niveaux : temps réel (live), encaissements (cash), revenus validés (validated).
 * Source unique pour les dashboards CEO, Compagnie et Agence. Ne supprime pas dailyStats (conservé pour comptabilité / historique).
 * Alignement dates : getStartOfDayInBamako / getEndOfDayInBamako (Africa/Bamako) comme CEO et networkStatsService.
 */

import { collectionGroup, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { isSoldReservation } from "@/modules/compagnie/networkStats/networkStatsService";
import { getCashTransactionsByDateRange } from "@/modules/compagnie/cash/cashService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";

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
    total: number;
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
 * - live : reservations (isSoldReservation) + shipments payés (transportFee + insuranceAmount)
 * - cash : cashTransactions status === "paid"
 * - validated : dailyStats (ticketRevenue + courierRevenue)
 */
export async function getUnifiedAgencyFinance(
  companyId: string,
  agencyId: string,
  dateFrom: string,
  dateTo: string
): Promise<UnifiedAgencyFinance> {
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const [reservationsSnap, shipmentsSnap, cashTxList, dailyStatsSnap] = await Promise.all([
    getDocs(
      query(
        collectionGroup(db, "reservations"),
        where("companyId", "==", companyId),
        where("agencyId", "==", agencyId),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    ),
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
    getCashTransactionsByDateRange(companyId, dateFrom, dateTo),
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

  const reservations = reservationsSnap.docs.map((d) => {
    const data = d.data();
    return {
      statut: (data.statut ?? data.status ?? "").toString(),
      montant: Number(data.montant ?? data.amount ?? 0) || 0,
    };
  });
  const soldReservations = reservations.filter((r) => isSoldReservation(r.statut));
  const liveTickets = soldReservations.length;
  const liveTicketsRevenue = soldReservations.reduce((sum, r) => sum + r.montant, 0);

  let liveCourierRevenue = 0;
  shipmentsSnap.docs.forEach((d) => {
    const s = d.data() as { paymentStatus?: string; transportFee?: number; insuranceAmount?: number };
    if (isPaidShipment(s.paymentStatus)) {
      liveCourierRevenue += Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
    }
  });

  const cashTotal = cashTxList
    .filter(
      (t) =>
        (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID &&
        ((t as { agencyId?: string }).agencyId === agencyId || t.locationId === agencyId)
    )
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  let validatedTotal = 0;
  let validatedAgencySum = 0;
  let validatedCompanySum = 0;
  dailyStatsSnap.docs.forEach((d) => {
    const data = d.data();
    const ticket = Number(data.ticketRevenue ?? data.totalRevenue ?? 0);
    const courier = Number(data.courierRevenue ?? 0);
    validatedTotal += ticket + courier;
    validatedAgencySum += Number(data.ticketRevenueAgency ?? 0) + Number(data.courierRevenueAgency ?? 0);
    validatedCompanySum += Number(data.ticketRevenueCompany ?? 0) + Number(data.courierRevenueCompany ?? 0);
  });

  const liveTotalRevenue = liveTicketsRevenue + liveCourierRevenue;

  const result: UnifiedAgencyFinance = {
    live: {
      tickets: liveTickets,
      courier: liveCourierRevenue,
      liveTicketsRevenue,
      liveCourierRevenue,
      totalRevenue: liveTotalRevenue,
    },
    cash: { total: cashTotal },
    validated: {
      totalRevenue: validatedTotal,
      validatedAgency: validatedAgencySum,
      validatedCompany: validatedCompanySum,
    },
  };

  if (typeof console !== "undefined" && console.log) {
    console.log("[unifiedFinanceService] getUnifiedAgencyFinance", {
      source: "reservations + shipments + cashTransactions + dailyStats",
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
 */
export async function getUnifiedCompanyFinance(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<UnifiedAgencyFinance> {
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);
  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const [reservationsSnap, shipmentsSnap, cashTxList, dailyStatsSnap] = await Promise.all([
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
    getDocs(
      query(
        shipmentsRef(db, companyId),
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "asc"),
        limit(5000)
      )
    ),
    getCashTransactionsByDateRange(companyId, dateFrom, dateTo),
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

  const reservations = reservationsSnap.docs.map((d) => {
    const data = d.data();
    return {
      statut: (data.statut ?? data.status ?? "").toString(),
      montant: Number(data.montant ?? data.amount ?? 0) || 0,
    };
  });
  const soldReservations = reservations.filter((r) => isSoldReservation(r.statut));
  const liveTickets = soldReservations.length;
  const liveTicketsRevenue = soldReservations.reduce((sum, r) => sum + r.montant, 0);

  let liveCourierRevenue = 0;
  shipmentsSnap.docs.forEach((d) => {
    const s = d.data() as { paymentStatus?: string; transportFee?: number; insuranceAmount?: number };
    if (isPaidShipment(s.paymentStatus)) {
      liveCourierRevenue += Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
    }
  });

  const cashTotal = cashTxList
    .filter((t) => (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  let validatedTotal = 0;
  let validatedAgencySum = 0;
  let validatedCompanySum = 0;
  dailyStatsSnap.docs.forEach((d) => {
    const data = d.data();
    const ticket = Number(data.ticketRevenue ?? data.totalRevenue ?? 0);
    const courier = Number(data.courierRevenue ?? 0);
    validatedTotal += ticket + courier;
    validatedAgencySum += Number(data.ticketRevenueAgency ?? 0) + Number(data.courierRevenueAgency ?? 0);
    validatedCompanySum += Number(data.ticketRevenueCompany ?? 0) + Number(data.courierRevenueCompany ?? 0);
  });

  const liveTotalRevenue = liveTicketsRevenue + liveCourierRevenue;

  const result: UnifiedAgencyFinance = {
    live: {
      tickets: liveTickets,
      courier: liveCourierRevenue,
      liveTicketsRevenue,
      liveCourierRevenue,
      totalRevenue: liveTotalRevenue,
    },
    cash: { total: cashTotal },
    validated: {
      totalRevenue: validatedTotal,
      validatedAgency: validatedAgencySum,
      validatedCompany: validatedCompanySum,
    },
  };

  if (typeof console !== "undefined" && console.log) {
    console.log("[unifiedFinanceService] getUnifiedCompanyFinance", {
      source: "reservations + shipments + cashTransactions + dailyStats",
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
