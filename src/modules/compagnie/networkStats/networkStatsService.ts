/**
 * Source unique des indicateurs réseau TELIYA.
 * Toutes les pages (Poste de pilotage, Réservations réseau, tableau agences, Flotte)
 * doivent utiliser getNetworkStats() pour afficher les mêmes chiffres.
 * Les dates « jour » pour une agence utilisent `timeZone` (défaut Africa/Bamako).
 */

import { collectionGroup, getDocs, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  TZ_BAMAKO,
  DEFAULT_AGENCY_TIMEZONE,
  getTodayBamako,
  getStartOfDayBamako,
  getEndOfDayBamako,
  getStartOfDayInBamako,
  getEndOfDayInBamako,
  getStartOfDayForDate,
  getEndOfDayForDate,
  getDateKeyInTimezone,
  getHourInTimezone,
  normalizeDateToYYYYMMDD,
} from "@/shared/date/dateUtilsTz";
import {
  isConfirmedTransactionStatus,
  listFinancialTransactionsByPeriod,
} from "@/modules/compagnie/treasury/financialTransactions";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import { listTripInstancesByDateRange } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { getBusesInProgressCountToday } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { OPERATIONAL_STATUS, TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";

/** Billets vendus = uniquement statut confirme ou paye (après normalisation). */
export function isSoldReservation(statut: string | undefined): boolean {
  const s = canonicalStatut(statut);
  return s === "confirme" || s === "paye";
}

export interface NetworkStats {
  /** CA total : somme des payment_received confirmés (ledger) sur la période */
  totalRevenue: number;
  /** Billets vendus : réservations créées sur la période (createdAt), toute période (jour/semaine/mois) */
  totalTickets: number;
  /** Agences actives : nombre de agencyId distincts parmi les réservations créées sur la période */
  activeAgencies: number;
  /** Réservations aujourd'hui : réservations créées aujourd'hui (createdAt) */
  reservationsToday: number;
  /** Véhicules disponibles : operationalStatus = GARAGE, technicalStatus = NORMAL */
  vehiclesAvailable: number;
  /** Nombre total de véhicules (flotte) */
  vehiclesTotal: number;
  /** Bus en circulation : tripInstances status boarding ou departed (aujourd'hui) */
  busesInTransit: number;
  /** Capacité réseau période : somme des (seatCapacity ?? capacitySeats) des tripInstances de la période */
  networkCapacity: number;
}

const CANCELLED_STATUTS = ["cancelled", "cancel", "annule", "annulé", "refused", "refuse"];

export function isCancelledReservation(statut: string | undefined): boolean {
  const s = (statut ?? "").toString().toLowerCase().trim();
  return CANCELLED_STATUTS.some((c) => s === c || s.includes(c));
}

function isCancelled(statut: string | undefined): boolean {
  return isCancelledReservation(statut);
}

/** Format date key YYYY-MM-DD from a Date in Bamako */
function getDateKeyBamako(d: Date): string {
  return dayjs(d).tz(TZ_BAMAKO).format("YYYY-MM-DD");
}

/** Heure (0–23) en Bamako à partir d'une Date */
function getHourBamako(d: Date): number {
  return dayjs(d).tz(TZ_BAMAKO).hour();
}

/**
 * Récupère les réservations créées entre deux dates (createdAt).
 * Source unique pour les ventes : même logique pour jour, semaine, mois (aligné page Réservations).
 * Requiert index : reservations (companyId, createdAt).
 */
async function getReservationsByCreatedAtRange(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ id: string; agencyId: string; statut?: string; createdAt: Date }[]> {
  const startTs = Timestamp.fromDate(startDate);
  const endTs = Timestamp.fromDate(endDate);
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "asc"),
    limit(5000)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? new Date(0);
    return {
      id: d.id,
      agencyId: (data.agencyId ?? data.agenceId ?? "").toString(),
      statut: (data.statut ?? data.status ?? "").toString(),
      createdAt,
    };
  });
}

async function getLedgerPaymentReceivedByPeriod(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ amount: number; performedAt: Date }>> {
  const rows = await listFinancialTransactionsByPeriod(
    companyId,
    Timestamp.fromDate(startDate),
    Timestamp.fromDate(endDate)
  );
  return rows
    .filter((r) => r.type === "payment_received" && isConfirmedTransactionStatus(r.status))
    .map((r) => {
      const ts = r.performedAt as Timestamp | undefined;
      const performedAt = ts?.toDate?.() ?? new Date(0);
      return {
        amount: Number(r.amount ?? 0) || 0,
        performedAt,
      };
    })
    .filter((r) => r.amount > 0);
}

/** Réservation chargée une seule fois pour la page Réservations réseau (tableau, cartes, graphique). */
export interface ReservationInRange {
  id: string;
  agencyId: string;
  statut?: string;
  createdAt: Date;
  montant: number;
  seatsGo: number;
}

/**
 * Charge les réservations de la période UNE SEULE FOIS (collectionGroup filtré par createdAt).
 * À utiliser comme source unique pour : tableau agences, cartes (billets, CA), graphique par jour.
 * Requiert index : reservations (companyId, createdAt).
 */
export async function getReservationsInRange(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<ReservationInRange[]> {
  const startTs = Timestamp.fromDate(startDate);
  const endTs = Timestamp.fromDate(endDate);
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "asc"),
    limit(5000)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? new Date(0);
    return {
      id: d.id,
      agencyId: (data.agencyId ?? data.agenceId ?? "").toString(),
      statut: (data.statut ?? data.status ?? "").toString(),
      createdAt,
      montant: Number(data.montant ?? data.amount ?? 0) || 0,
      seatsGo: Number(data.seatsGo ?? data.seats ?? data.nbPlaces ?? 1) || 1,
    };
  });
}

/** Statuts considérés comme "payé" pour CA et graphique (aligné reservationStatusUtils). */
export function isPaidReservation(statut: string | undefined): boolean {
  const s = (statut ?? "").toString().toLowerCase().trim();
  return s === "paye" || s === "payé" || s === "paid" || s === "payed" || s === "confirme" || s === "validé";
}

/**
 * Construit les données du graphique (CA + réservations par jour/heure) à partir de reservationsInRange.
 * Une seule source de vérité : pas de requête Firestore supplémentaire.
 */
export function buildChartDataFromReservations(
  reservations: ReservationInRange[],
  dateFrom: string,
  dateTo: string
): ChartDataPoint[] {
  /** Aligné cartes / KPI réseau : toutes les réservations de la période, 1 point = 1 réservation (pas filtre statut). */
  const isSingleDay = dateFrom === dateTo;
  const map = new Map<string, { revenue: number; reservations: number }>();

  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      map.set(`${dateFrom}T${String(h).padStart(2, "0")}`, { revenue: 0, reservations: 0 });
    }
    reservations.forEach((r) => {
      const hour = getHourBamako(r.createdAt);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += r.montant;
      curr.reservations += 1;
      map.set(key, curr);
    });
  } else {
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T23:59:59");
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      map.set(getDateKeyBamako(new Date(t)), { revenue: 0, reservations: 0 });
    }
    reservations.forEach((r) => {
      const key = getDateKeyBamako(r.createdAt);
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += r.montant;
      curr.reservations += 1;
      map.set(key, curr);
    });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, reservations: v.reservations }));
}

/**
 * Capacité réseau (somme des places des tripInstances de la période) sans charger les réservations.
 * Utilisé pour le taux de remplissage quand la page a déjà reservationsInRange comme source.
 */
export async function getNetworkCapacityOnly(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<number> {
  const [tripInstances, vehicles] = await Promise.all([
    listTripInstancesByDateRange(companyId, dateFrom, dateTo, { limitCount: 2000 }),
    listVehicles(companyId, 500),
  ]);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  return tripInstances.reduce((sum, ti) => {
    const tiCap = (ti as { seatCapacity?: number }).seatCapacity ?? (ti as { capacitySeats?: number }).capacitySeats;
    const vehicleId = (ti as { vehicleId?: string | null }).vehicleId;
    const cap = Number(tiCap) || (vehicleId ? Number(vehiclesById.get(vehicleId)?.capacity) || 0 : 0);
    return sum + cap;
  }, 0);
}

export interface AgencyStats {
  totalTickets: number;
  totalRevenue: number;
  onlineTickets: number;
  counterTickets: number;
  /** Graphique journalier/horaires aligné sur CEO (même structure que ChartDataPoint). */
  dailyChartData: ChartDataPoint[];
}

/**
 * Statistiques d'une agence unique, avec les mêmes règles que le CEO :
 * - Billets vendus = réservations créées (createdAt Bamako) dont statut canonique ∈ {confirme, paye}
 * - Période définie par [dateFrom, dateTo] (YYYY-MM-DD) dans le fuseau `timeZone` (souvent `agency.timezone`)
 * - Découpage journalier ou horaire identique à buildChartDataFromReservations/getNetworkStatsChartData
 */
export async function getAgencyStats(
  companyId: string,
  agencyId: string,
  dateFrom: string,
  dateTo: string,
  timeZone: string = DEFAULT_AGENCY_TIMEZONE
): Promise<AgencyStats> {
  const periodStart = getStartOfDayForDate(dateFrom, timeZone);
  const periodEnd = getEndOfDayForDate(dateTo, timeZone);

  const startTs = Timestamp.fromDate(periodStart);
  const endTs = Timestamp.fromDate(periodEnd);

  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("agencyId", "==", agencyId),
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "asc"),
    limit(5000)
  );

  const snap = await getDocs(q);
  const reservations = snap.docs.map((d) => {
    const data = d.data();
    const createdAt = data.createdAt?.toDate?.() ?? new Date(0);
    const statut = (data.statut ?? data.status ?? "").toString();
    const montant = Number(data.montant ?? data.amount ?? 0) || 0;
    const seatsGo = Number(data.seatsGo ?? data.seats ?? data.nbPlaces ?? 1) || 1;
    const canalRaw = (data.canal ?? "").toString().toLowerCase().trim();
    const canalNorm = canalRaw.replace(/\s|_|-/g, "");
    const isOnline =
      canalNorm.includes("ligne") || canalNorm === "online" || canalNorm === "web";
    const canal: "online" | "counter" = isOnline ? "online" : "counter";
    return {
      createdAt,
      statut,
      montant,
      seatsGo,
      canal,
    };
  });

  const sold = reservations.filter((r) => isSoldReservation(r.statut));
  const totalTickets = sold.length;
  const totalRevenue = sold.reduce((sum, r) => sum + r.montant, 0);
  const onlineTickets = sold.filter((r) => r.canal === "online").length;
  const counterTickets = sold.filter((r) => r.canal === "counter").length;

  // Construire dailyChartData à partir des sold (mêmes règles que buildChartDataFromReservations).
  const isSingleDay = dateFrom === dateTo;
  const map = new Map<string, { revenue: number; reservations: number }>();

  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      map.set(`${dateFrom}T${String(h).padStart(2, "0")}`, { revenue: 0, reservations: 0 });
    }
    sold.forEach((r) => {
      const hour = getHourInTimezone(r.createdAt, timeZone);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += r.montant;
      curr.reservations += r.seatsGo;
      map.set(key, curr);
    });
  } else {
    const fromNorm = normalizeDateToYYYYMMDD(dateFrom);
    const toNorm = normalizeDateToYYYYMMDD(dateTo);
    let cur = dayjs.tz(`${fromNorm}T12:00:00`, timeZone);
    for (;;) {
      const key = cur.format("YYYY-MM-DD");
      map.set(key, { revenue: 0, reservations: 0 });
      if (key >= toNorm) break;
      cur = cur.add(1, "day");
    }
    sold.forEach((r) => {
      const key = getDateKeyInTimezone(r.createdAt, timeZone);
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += r.montant;
      curr.reservations += r.seatsGo;
      map.set(key, curr);
    });
  }

  const dailyChartData: ChartDataPoint[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, reservations: v.reservations }));

  return {
    totalTickets,
    totalRevenue,
    onlineTickets,
    counterTickets,
    dailyChartData,
  };
}

/**
 * Source unique : tous les indicateurs réseau pour une période.
 * Logique des ventes : billets vendus = réservations créées (createdAt) pour toutes les périodes (jour, semaine, mois).
 */
export async function getNetworkStats(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<NetworkStats> {
  const today = getTodayBamako();
  const startOfDay = getStartOfDayBamako();
  const endOfDay = getEndOfDayBamako();
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);

  if (typeof console !== "undefined" && console.log) {
    console.log("networkStats [date tz]", {
      today,
      dateFrom,
      dateTo,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  }

  const [ledgerPayments, reservationsByCreatedAt, tripInstances, busesInTransit, vehicles] = await Promise.all([
    getLedgerPaymentReceivedByPeriod(companyId, periodStart, periodEnd),
    getReservationsByCreatedAtRange(companyId, periodStart, periodEnd),
    listTripInstancesByDateRange(companyId, dateFrom, dateTo, { limitCount: 2000 }),
    getBusesInProgressCountToday(companyId),
    listVehicles(companyId, 500),
  ]);

  if (typeof console !== "undefined" && console.log) {
    console.log("reservations source", {
      collection: "companies/{id}/agences/{id}/reservations (collectionGroup)",
      filter: "createdAt >= periodStart && createdAt <= periodEnd (toutes périodes)",
      docsCount: reservationsByCreatedAt.length,
      sample: reservationsByCreatedAt.slice(0, 3),
    });
  }

  const totalRevenue = ledgerPayments.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const soldReservations = reservationsByCreatedAt.filter((r) => isSoldReservation(r.statut));
  const totalTickets = soldReservations.length;
  const activeAgenciesSet = new Set(soldReservations.map((r) => r.agencyId).filter(Boolean));
  const activeAgencies = activeAgenciesSet.size;

  const soldToday = soldReservations.filter(
    (r) => r.createdAt >= startOfDay && r.createdAt <= endOfDay
  );
  const reservationsToday = soldToday.length;

  if (typeof console !== "undefined" && console.log) {
    console.log("networkStats [ventes createdAt]", {
      today,
      reservationsLoaded: reservationsByCreatedAt.length,
      totalTickets,
      reservationsToday,
      source: "createdAt (jour, semaine, mois)",
    });
    console.log("reservationsTodayCount", reservationsToday);
    console.log("networkStats source", { totalTickets, reservationsToday, activeAgencies });
  }

  const vehiclesAvailable = vehicles.filter(
    (v) =>
      (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.GARAGE &&
      (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.NORMAL
  ).length;
  const vehiclesTotal = vehicles.length;

  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const networkCapacity = tripInstances.reduce((sum, ti) => {
    const tiCap = (ti as { seatCapacity?: number }).seatCapacity ?? (ti as { capacitySeats?: number }).capacitySeats;
    const vehicleId = (ti as { vehicleId?: string | null }).vehicleId;
    const cap = Number(tiCap) || (vehicleId ? Number(vehiclesById.get(vehicleId)?.capacity) || 0 : 0);
    return sum + cap;
  }, 0);

  const stats: NetworkStats = {
    totalRevenue,
    totalTickets,
    activeAgencies,
    reservationsToday,
    vehiclesAvailable,
    vehiclesTotal,
    busesInTransit,
    networkCapacity,
  };

  if (typeof console !== "undefined" && console.log) {
    console.log("networkStats", stats);
  }

  return stats;
}

export type ChartDataPoint = { date: string; revenue: number; reservations: number };

/**
 * Données du graphique "Évolution CA / réservations" à partir de la MÊME source que les cartes.
 * - CA = payment_received confirmés (ledger), agrégé par jour ou par heure.
 * - Réservations = réservations créées (createdAt), non annulées, agrégées par jour ou par heure.
 * Ainsi le graphique reflète exactement les totaux affichés dans les cartes.
 */
export async function getNetworkStatsChartData(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<ChartDataPoint[]> {
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);
  const isSingleDay = dateFrom === dateTo;

  const [ledgerPayments, reservationsByCreatedAt] = await Promise.all([
    getLedgerPaymentReceivedByPeriod(companyId, periodStart, periodEnd),
    getReservationsByCreatedAtRange(companyId, periodStart, periodEnd),
  ]);

  const soldReservations = reservationsByCreatedAt.filter((r) => isSoldReservation(r.statut));

  const map = new Map<string, { revenue: number; reservations: number }>();

  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      const key = `${dateFrom}T${String(h).padStart(2, "0")}`;
      map.set(key, { revenue: 0, reservations: 0 });
    }
    ledgerPayments.forEach((t) => {
      const hour = getHourBamako(t.performedAt);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += Number(t.amount) || 0;
      map.set(key, curr);
    });
    soldReservations.forEach((r) => {
      const hour = getHourBamako(r.createdAt);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.reservations += 1;
      map.set(key, curr);
    });
  } else {
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T23:59:59");
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      const key = getDateKeyBamako(new Date(t));
      map.set(key, { revenue: 0, reservations: 0 });
    }
    ledgerPayments.forEach((t) => {
      const key = getDateKeyBamako(t.performedAt);
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += Number(t.amount) || 0;
      map.set(key, curr);
    });
    soldReservations.forEach((r) => {
      const key = getDateKeyBamako(r.createdAt);
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.reservations += 1;
      map.set(key, curr);
    });
  }

  const chartData = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, reservations: v.reservations }));

  if (typeof console !== "undefined" && console.log) {
    console.log("chartData (same source as cards)", chartData);
  }

  return chartData;
}
