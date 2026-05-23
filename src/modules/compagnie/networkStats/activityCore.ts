/**
 * Activité commerciale : lecture depuis le journal persisté `activityLogs` uniquement.
 * Pour reprise d’historique avant journalisation, voir `activityLogsMigrationLegacy.ts`.
 */
import {
  collectionGroup,
  getDocs,
  query,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  DEFAULT_AGENCY_TIMEZONE,
  getStartOfDayForDate,
  getEndOfDayForDate,
  getDateKeyInTimezone,
  getHourInTimezone,
  normalizeDateToYYYYMMDD,
} from "@/shared/date/dateUtilsTz";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import { getInclusiveRangeDays } from "@/shared/date/periodUtils";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export type ActivityPeriod = { dateFrom: string; dateTo: string };

export const ACTIVITY_LOG_DETAIL_MAX_DAYS = 7;

export type ActivitySlice = {
  reservationCount: number;
  tickets: number;
  amount: number;
};

export type BilletsActivity = ActivitySlice & {
  guichet: ActivitySlice;
  online: ActivitySlice;
};

export type UnifiedCommercialActivity = {
  billets: BilletsActivity;
  courier: { parcels: number; amount: number };
  totalAmount: number;
};

export type DailyStatsActivityDoc = {
  agencyId?: string;
  date?: string;
  ticketRevenue?: number;
  ticketRevenueCompany?: number;
  courierRevenue?: number;
  courierRevenueCompany?: number;
  totalRevenue?: number;
  totalPassengers?: number;
  totalSeats?: number;
  courierParcels?: number;
  parcelCount?: number;
};

/** Ligne `activityLogs` comptée dans l’activité commerciale (aligné agrégats, graphique, par agence). */
export type ParsedCommercialActivityLog =
  | { kind: "courier"; amount: number; agencyId: string }
  | { kind: "guichet_ticket"; amount: number; seats: number; agencyId: string }
  | { kind: "online_ticket"; amount: number; seats: number; agencyId: string };

export function parseCommercialActivityLog(data: Record<string, unknown>): ParsedCommercialActivityLog | null {
  if (String(data.status ?? "") !== "confirmed") return null;
  const agencyId = String(data.agencyId ?? "").trim();
  const amount = Number(data.amount ?? 0);
  const seats = Number(data.seats ?? 0);
  const type = String(data.type ?? "");
  const source = String(data.source ?? "");
  if (type === "courier") return { kind: "courier", amount, agencyId };
  if (type === "ticket" && source === "guichet") return { kind: "guichet_ticket", amount, seats, agencyId };
  if (type === "online" && source === "online") return { kind: "online_ticket", amount, seats, agencyId };
  return null;
}

function emptySlice(): ActivitySlice {
  return { reservationCount: 0, tickets: 0, amount: 0 };
}

export function shouldUseDailyStatsForActivity(start: Date, end: Date): boolean {
  return getInclusiveRangeDays(start, end) > ACTIVITY_LOG_DETAIL_MAX_DAYS;
}

/** @deprecated Utilisé seulement par l’outil de migration / audits locaux. */
export function isSoldReservationForActivity(statut: string | undefined): boolean {
  const s = (statut ?? "").toString().toLowerCase().trim();
  return s === "paye" || s === "payé" || s === "paid" || s === "payed" || s === "confirme" || s === "validé";
}

export type ReservationActivityRow = {
  agencyId: string;
  statut: string;
  montant: number;
  seatsGo: number;
  seatsReturn: number;
  createdAt: Date;
  raw: Record<string, unknown>;
};

export function aggregateActivityLogDocs(
  docs: QueryDocumentSnapshot<DocumentData>[]
): UnifiedCommercialActivity {
  const guichet = emptySlice();
  const online = emptySlice();
  let courierParcels = 0;
  let courierAmount = 0;

  for (const d of docs) {
    const parsed = parseCommercialActivityLog(d.data() as Record<string, unknown>);
    if (!parsed) continue;
    if (parsed.kind === "courier") {
      courierParcels += 1;
      courierAmount += parsed.amount;
      continue;
    }
    if (parsed.kind === "guichet_ticket") {
      guichet.reservationCount += 1;
      guichet.tickets += parsed.seats;
      guichet.amount += parsed.amount;
    } else {
      online.reservationCount += 1;
      online.tickets += parsed.seats;
      online.amount += parsed.amount;
    }
  }

  const billets: BilletsActivity = {
    reservationCount: guichet.reservationCount + online.reservationCount,
    tickets: guichet.tickets + online.tickets,
    amount: guichet.amount + online.amount,
    guichet,
    online,
  };

  return {
    billets,
    courier: { parcels: courierParcels, amount: courierAmount },
    totalAmount: billets.amount + courierAmount,
  };
}

export async function queryDailyStatsInRange(
  companyId: string,
  dateFrom: string,
  dateTo: string,
  agencyId?: string
): Promise<DailyStatsActivityDoc[]> {
  const constraints: QueryConstraint[] = [
    where("companyId", "==", companyId),
    where("date", ">=", normalizeDateToYYYYMMDD(dateFrom)),
    where("date", "<=", normalizeDateToYYYYMMDD(dateTo)),
  ];
  if (agencyId) constraints.push(where("agencyId", "==", agencyId));
  const snap = await getDocs(query(collectionGroup(db, "dailyStats"), ...constraints));
  return snap.docs.map((d) => d.data() as DailyStatsActivityDoc);
}

export function aggregateDailyStatsDocs(docs: DailyStatsActivityDoc[]): UnifiedCommercialActivity {
  const guichet = emptySlice();
  const online = emptySlice();
  let courierParcels = 0;
  let courierAmount = 0;

  for (const data of docs) {
    const ticketAmount = Number(data.ticketRevenue ?? data.ticketRevenueCompany ?? 0) || 0;
    const parcelAmount = Number(data.courierRevenue ?? data.courierRevenueCompany ?? 0) || 0;
    const totalAmount = Number(data.totalRevenue ?? 0) || 0;
    const tickets = Number(data.totalSeats ?? data.totalPassengers ?? 0) || 0;
    const parcels = Number(data.courierParcels ?? data.parcelCount ?? 0) || 0;
    const fallbackTicketAmount = ticketAmount || (parcelAmount ? 0 : totalAmount);

    // dailyStats ne conserve pas le split guichet/online : les KPI restent exacts au total.
    guichet.reservationCount += tickets;
    guichet.tickets += tickets;
    guichet.amount += fallbackTicketAmount;
    courierParcels += parcels;
    courierAmount += parcelAmount;
  }

  const billets: BilletsActivity = {
    reservationCount: guichet.reservationCount + online.reservationCount,
    tickets: guichet.tickets + online.tickets,
    amount: guichet.amount + online.amount,
    guichet,
    online,
  };

  return {
    billets,
    courier: { parcels: courierParcels, amount: courierAmount },
    totalAmount: billets.amount + courierAmount,
  };
}

export function buildActivityChartBucketsFromDailyStats(
  docs: DailyStatsActivityDoc[],
  dateFrom: string,
  dateTo: string,
  timeZone: string
): Map<string, { revenue: number; reservations: number }> {
  const map = new Map<string, { revenue: number; reservations: number }>();
  const fromNorm = normalizeDateToYYYYMMDD(dateFrom);
  const toNorm = normalizeDateToYYYYMMDD(dateTo);
  let cur = dayjs.tz(`${fromNorm}T12:00:00`, timeZone);

  for (;;) {
    const key = cur.format("YYYY-MM-DD");
    map.set(key, { revenue: 0, reservations: 0 });
    if (key >= toNorm) break;
    cur = cur.add(1, "day");
  }

  for (const data of docs) {
    const key = normalizeDateToYYYYMMDD(data.date ?? "");
    if (!key) continue;
    const ticketAmount = Number(data.ticketRevenue ?? data.ticketRevenueCompany ?? 0) || 0;
    const courierAmount = Number(data.courierRevenue ?? data.courierRevenueCompany ?? 0) || 0;
    const totalAmount = Number(data.totalRevenue ?? ticketAmount + courierAmount) || 0;
    const tickets = Number(data.totalSeats ?? data.totalPassengers ?? 0) || 0;
    const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
    curr.revenue += totalAmount;
    curr.reservations += tickets;
    map.set(key, curr);
  }

  return map;
}

/**
 * Source unique persistée : somme des entrées `activityLogs` sur la période (fuseau `timeZone`).
 */
export async function getUnifiedCommercialActivity(
  companyId: string,
  period: ActivityPeriod,
  options?: { agencyId?: string; timeZone?: string }
): Promise<UnifiedCommercialActivity> {
  const tz = options?.timeZone ?? DEFAULT_AGENCY_TIMEZONE;
  const start = getStartOfDayForDate(period.dateFrom, tz);
  const end = getEndOfDayForDate(period.dateTo, tz);
  if (shouldUseDailyStatsForActivity(start, end)) {
    const docs = await queryDailyStatsInRange(companyId, period.dateFrom, period.dateTo, options?.agencyId);
    return aggregateDailyStatsDocs(docs);
  }
  const docs = await queryActivityLogsInRange(companyId, start, end, options?.agencyId);
  return aggregateActivityLogDocs(docs);
}

function logDocCreatedAt(d: QueryDocumentSnapshot<DocumentData>): Date {
  const x = d.data().createdAt as Timestamp | undefined;
  return x?.toDate?.() ?? new Date(0);
}

/** Séries journalières / horaires à partir des logs (aligné KPI). */
export function buildActivityChartBucketsFromLogs(
  docs: QueryDocumentSnapshot<DocumentData>[],
  dateFrom: string,
  dateTo: string,
  timeZone: string
): Map<string, { revenue: number; reservations: number }> {
  const isSingleDay = dateFrom === dateTo;
  const map = new Map<string, { revenue: number; reservations: number }>();

  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      map.set(`${dateFrom}T${String(h).padStart(2, "0")}`, { revenue: 0, reservations: 0 });
    }
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
  }

  for (const d of docs) {
    const x = d.data() as Record<string, unknown>;
    const parsed = parseCommercialActivityLog(x);
    if (!parsed) continue;
    const created = logDocCreatedAt(d);
    const amount = parsed.amount;
    const seatContribution =
      parsed.kind === "guichet_ticket" || parsed.kind === "online_ticket" ? parsed.seats : 0;

    if (isSingleDay) {
      const hour = getHourInTimezone(created, timeZone);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += amount;
      curr.reservations += seatContribution;
      map.set(key, curr);
    } else {
      const key = getDateKeyInTimezone(created, timeZone);
      const curr = map.get(key) ?? { revenue: 0, reservations: 0 };
      curr.revenue += amount;
      curr.reservations += seatContribution;
      map.set(key, curr);
    }
  }
  return map;
}
