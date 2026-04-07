/**
 * Indicateurs réseau et agrégats agence.
 * L’activité commerciale lit uniquement `companies/{id}/activityLogs` (voir `activityLogsService`).
 */

import {
  collectionGroup,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
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
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import {
  aggregateActivityLogDocs,
  buildActivityChartBucketsFromLogs,
} from "@/modules/compagnie/networkStats/activityCore";

/** Billets vendus = uniquement statut confirme ou paye (après normalisation). */
export function isSoldReservation(statut: string | undefined): boolean {
  const s = canonicalStatut(statut);
  return s === "confirme" || s === "paye";
}

export interface NetworkStats {
  /** Chiffre d’activité : billets vendus (réservations payées, createdAt) + courrier payé — hors ledger. */
  totalRevenue: number;
  /** Places vendues (somme des sièges aller / A/R) sur la période — même règle que l’activité réseau. */
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
  seatsReturn?: number;
  depart?: string;
  arrivee?: string;
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
      seatsReturn: Number(data.seatsReturn ?? 0) || 0,
      depart: String(data.depart ?? data.departure ?? "").trim() || undefined,
      arrivee: String(data.arrivee ?? data.arrival ?? "").trim() || undefined,
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
  /** Places vendues (activité billets). */
  totalTickets: number;
  /** Billets + courrier payé (activité commerciale, hors ledger). */
  totalRevenue: number;
  /** Nombre de réservations en ligne (payées). */
  onlineTickets: number;
  /** Nombre de réservations guichet (payées). */
  counterTickets: number;
  /** Graphique journalier/horaires aligné sur CEO (même structure que ChartDataPoint). */
  dailyChartData: ChartDataPoint[];
}

/**
 * Statistiques d'une agence — même moteur que l’activité réseau / CEO (`activityCore`).
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
  const docs = await queryActivityLogsInRange(companyId, periodStart, periodEnd, agencyId);
  const activity = aggregateActivityLogDocs(docs);
  const map = buildActivityChartBucketsFromLogs(docs, dateFrom, dateTo, timeZone);
  const dailyChartData: ChartDataPoint[] = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, reservations: v.reservations }));

  return {
    totalTickets: activity.billets.tickets,
    totalRevenue: activity.totalAmount,
    onlineTickets: activity.billets.online.reservationCount,
    counterTickets: activity.billets.guichet.reservationCount,
    dailyChartData,
  };
}

/**
 * Indicateurs réseau pour une période : ventes / billets depuis `activityLogs` ; capacité et flotte depuis le planning (hors journal d’activité).
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

  const [activityDocs, tripInstances, busesInTransit, vehicles] = await Promise.all([
    queryActivityLogsInRange(companyId, periodStart, periodEnd),
    listTripInstancesByDateRange(companyId, dateFrom, dateTo, { limitCount: 2000 }),
    getBusesInProgressCountToday(companyId),
    listVehicles(companyId, 500),
  ]);

  const netActivity = aggregateActivityLogDocs(activityDocs);
  const totalRevenue = netActivity.totalAmount;
  const totalTickets = netActivity.billets.tickets;

  const activeAgenciesSet = new Set<string>();
  for (const d of activityDocs) {
    const x = d.data() as { agencyId?: string; status?: string };
    if (String(x.status ?? "") !== "confirmed") continue;
    const aid = String(x.agencyId ?? "").trim();
    if (aid) activeAgenciesSet.add(aid);
  }
  const activeAgencies = activeAgenciesSet.size;

  const reservationsToday = activityDocs.filter((d) => {
    const x = d.data() as { type?: string; status?: string; createdAt?: { toDate?: () => Date } };
    if (String(x.status ?? "") !== "confirmed") return false;
    const t = String(x.type ?? "");
    if (t !== "ticket" && t !== "online") return false;
    const c = x.createdAt?.toDate?.() ?? new Date(0);
    return c >= startOfDay && c <= endOfDay;
  }).length;

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

  return {
    totalRevenue,
    totalTickets,
    activeAgencies,
    reservationsToday,
    vehiclesAvailable,
    vehiclesTotal,
    busesInTransit,
    networkCapacity,
  };
}

export type ChartDataPoint = { date: string; revenue: number; reservations: number };

/**
 * Points du graphique réseau : **uniquement** `activityLogs` (même filtre que `aggregateActivityLogDocs` : pas de dailyStats, réservations, sessions, ledger).
 * Un jour → un point par heure (0–23) ; plusieurs jours → un point par jour. La somme des `revenue` = CA d’activité ; somme des `reservations` = places billets.
 */
export function buildNetworkChartDataFromActivityLogDocs(
  docs: QueryDocumentSnapshot<DocumentData>[],
  dateFrom: string,
  dateTo: string,
  timeZone: string = TZ_BAMAKO
): ChartDataPoint[] {
  const map = buildActivityChartBucketsFromLogs(docs, dateFrom, dateTo, timeZone);
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, reservations: v.reservations }));
}

/**
 * Même série que {@link buildNetworkChartDataFromActivityLogDocs} après une lecture Firestore des logs.
 */
export async function getNetworkStatsChartData(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<ChartDataPoint[]> {
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);
  const docs = await queryActivityLogsInRange(companyId, periodStart, periodEnd);
  return buildNetworkChartDataFromActivityLogDocs(docs, dateFrom, dateTo, TZ_BAMAKO);
}
