/**
 * Source unique des indicateurs réseau TELIYA.
 * Toutes les pages (Poste de pilotage, Réservations réseau, tableau agences, Flotte)
 * doivent utiliser getNetworkStats() pour afficher les mêmes chiffres.
 * Les dates "aujourd'hui" sont calculées en fuseau Africa/Bamako pour cohérence à minuit.
 */

import { collectionGroup, getDocs, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  TZ_BAMAKO,
  getTodayBamako,
  getStartOfDayBamako,
  getEndOfDayBamako,
  getStartOfDayInBamako,
  getEndOfDayInBamako,
} from "@/shared/date/dateUtilsTz";
import { getCashTransactionsByDateRange } from "@/modules/compagnie/cash/cashService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";
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
  /** CA total : somme des cashTransactions payées sur la période */
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
  const paid = reservations.filter((r) => isSoldReservation(r.statut));
  const isSingleDay = dateFrom === dateTo;
  const map = new Map<string, { revenue: number; reservations: number }>();

  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      map.set(`${dateFrom}T${String(h).padStart(2, "0")}`, { revenue: 0, reservations: 0 });
    }
    paid.forEach((r) => {
      const hour = getHourBamako(r.createdAt);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += r.montant;
      curr.reservations += r.seatsGo;
      map.set(key, curr);
    });
  } else {
    const start = new Date(dateFrom + "T00:00:00");
    const end = new Date(dateTo + "T23:59:59");
    for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
      map.set(getDateKeyBamako(new Date(t)), { revenue: 0, reservations: 0 });
    }
    paid.forEach((r) => {
      const key = getDateKeyBamako(r.createdAt);
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += r.montant;
      curr.reservations += r.seatsGo;
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

  const [cashTx, reservationsByCreatedAt, tripInstances, busesInTransit, vehicles] = await Promise.all([
    getCashTransactionsByDateRange(companyId, dateFrom, dateTo),
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

  const paidCash = cashTx.filter((t) => (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID);
  const totalRevenue = paidCash.reduce((s, t) => s + (Number(t.amount) || 0), 0);

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
 * - CA = cashTransactions (status paid), agrégé par jour ou par heure.
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

  const [cashTx, reservationsByCreatedAt] = await Promise.all([
    getCashTransactionsByDateRange(companyId, dateFrom, dateTo),
    getReservationsByCreatedAtRange(companyId, periodStart, periodEnd),
  ]);

  const paidCash = cashTx.filter((t) => (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID);
  const soldReservations = reservationsByCreatedAt.filter((r) => isSoldReservation(r.statut));

  const map = new Map<string, { revenue: number; reservations: number }>();

  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      const key = `${dateFrom}T${String(h).padStart(2, "0")}`;
      map.set(key, { revenue: 0, reservations: 0 });
    }
    paidCash.forEach((t) => {
      const createdAt = t.createdAt as { toDate?: () => Date } | undefined;
      const d = typeof createdAt?.toDate === "function" ? createdAt.toDate() : new Date(t.date + "T12:00:00");
      const hour = getHourBamako(d);
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
    paidCash.forEach((t) => {
      const key = t.date ?? getDateKeyBamako(new Date());
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
