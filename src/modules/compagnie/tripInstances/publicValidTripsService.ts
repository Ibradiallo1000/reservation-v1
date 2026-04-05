/**
 * Offre publique : même logique que le guichet — créneaux issus des weeklyTrips sur la fenêtre
 * calendaire, enrichis par les tripInstances existantes (places, prix, annulation).
 * Les instances manquantes peuvent être créées à la réservation (getOrCreateTripInstanceForSlot).
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  buildTripInstanceId,
  listTripInstancesByRouteAndDateRange,
} from "./tripInstanceService";
import { fetchPendingOnlineHoldSeatsMap, onlineHoldCompositeKey } from "./onlineReservationHolds";
import { tripInstanceRemainingFromDoc, tripInstanceTime } from "./tripInstanceTypes";
import { normalizeTripInstanceTime } from "./generateTripInstancesFromWeeklyTrips";

/** Aligné guichet : 7 jours calendaires à partir d’aujourd’hui (inclus). */
export const PUBLIC_RESERVATION_SCHEDULE_DAYS = 7;

export function publicScheduleLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Prochains `dayCount` jours calendaires locaux (YYYY-MM-DD), en commençant aujourd’hui. */
export function getPublicScheduleDatesLocal(dayCount: number = PUBLIC_RESERVATION_SCHEDULE_DAYS): string[] {
  const today = new Date();
  const n = Math.max(1, Math.floor(dayCount));
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    out.push(publicScheduleLocalYmd(d));
  }
  return out;
}

function toYMD(d: Date): string {
  return publicScheduleLocalYmd(d);
}

function weekdayFRPublic(d: Date): string {
  return d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
}

function citiesMatchPublic(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type WeeklyRow = { agencyId: string; weeklyTripId: string; wt: Record<string, unknown> };

async function loadWeeklyTemplatesForPublicRoute(
  companyId: string,
  depN: string,
  arrN: string
): Promise<WeeklyRow[]> {
  const rows: WeeklyRow[] = [];
  let agenciesSnap;
  try {
    agenciesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
  } catch {
    return [];
  }
  for (const agDoc of agenciesSnap.docs) {
    const agencyId = agDoc.id;
    try {
      const wtSnap = await getDocs(collection(db, "companies", companyId, "agences", agencyId, "weeklyTrips"));
      for (const d of wtSnap.docs) {
        const wt = d.data() as Record<string, unknown>;
        if (wt.active === false) continue;
        const d0 = String(wt.departureCity ?? wt.departure ?? "").trim();
        const a0 = String(wt.arrivalCity ?? wt.arrival ?? "").trim();
        if (!citiesMatchPublic(d0, depN) || !citiesMatchPublic(a0, arrN)) continue;
        rows.push({ agencyId, weeklyTripId: d.id, wt });
      }
    } catch {
      /* agence sans weeklyTrips ou accès */
    }
  }
  return rows;
}

function startAfterIndex(
  items: ValidTrip[],
  cursor: { date: string; time: string; id: string } | null
): number {
  if (!cursor) return 0;
  const idx = items.findIndex(
    (t) =>
      t.date > cursor.date ||
      (t.date === cursor.date &&
        (t.time > cursor.time || (t.time === cursor.time && t.id.localeCompare(cursor.id) > 0)))
  );
  return idx === -1 ? items.length : idx;
}

export interface ValidTrip {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  remainingSeats: number;
  agencyId: string;
  /** Pour segments / bookSeats (aligné guichet). */
  routeId?: string;
  /** Document weeklyTrips source ; permet getOrCreate si l’instance n’existe pas encore. */
  weeklyTripId?: string;
  /** Capacité modèle (si pas d’instance). */
  seatCapacity?: number;
}

export interface BuildValidTripsParams {
  companyId: string;
  depNorm: string;
  arrNorm: string;
  /** Conservé pour compatibilité des appelants ; non utilisé. */
  normalize?: (s: string) => string;
  /**
   * Nombre de jours calendaires inclus à partir d’aujourd’hui (défaut = guichet : 7).
   * Prioritaire sur `daysAhead`.
   */
  scheduleDayCount?: number;
  /**
   * Ancien paramètre : dernier jour = aujourd’hui + `daysAhead` (donc fenêtre de `daysAhead + 1` jours).
   * Utilisé seulement si `scheduleDayCount` est absent.
   */
  daysAhead?: number;
  /** Nombre max de résultats renvoyés par la requête unique (défaut 100). */
  limitCount?: number;
  /** Curseur pour charger la page suivante. */
  startAfterCursor?: { date: string; time: string; id: string } | null;
}

/**
 * Construit l’offre à partir des weeklyTrips (toutes les agences) + tripInstances, comme le guichet.
 * Si aucun weeklyTrip ne correspond au couple villes, repli sur les seules instances (comportement historique).
 */
export async function buildValidTripsFromWeeklyTrips(
  params: BuildValidTripsParams
): Promise<{
  validTrips: ValidTrip[];
  dates: string[];
  hasMore: boolean;
  nextCursor: { date: string; time: string; id: string } | null;
}> {
  const {
    companyId,
    depNorm,
    arrNorm,
    scheduleDayCount: scheduleDayCountParam,
    daysAhead: legacyDaysAhead,
    limitCount = 100,
    startAfterCursor = null,
  } = params;

  const today = new Date();
  const todayYMD = toYMD(today);
  const depCity = depNorm.trim();
  const arrCity = arrNorm.trim();

  let scheduleDays: number;
  if (scheduleDayCountParam != null && scheduleDayCountParam > 0) {
    scheduleDays = Math.max(1, Math.min(60, Math.floor(scheduleDayCountParam)));
  } else if (legacyDaysAhead != null) {
    const add = Math.max(0, Math.floor(legacyDaysAhead));
    scheduleDays = Math.max(1, Math.min(60, add + 1));
  } else {
    scheduleDays = PUBLIC_RESERVATION_SCHEDULE_DAYS;
  }

  const end = new Date(today);
  end.setDate(today.getDate() + scheduleDays - 1);
  const dateFrom = todayYMD;
  const dateTo = toYMD(end);

  const instanceQueryLimit = Math.min(500, Math.max(200, limitCount * 4));
  const allInstances = await listTripInstancesByRouteAndDateRange(
    companyId,
    depCity,
    arrCity,
    dateFrom,
    dateTo,
    { limitCount: instanceQueryLimit, startAfterCursor: undefined }
  );
  const holdMap = await fetchPendingOnlineHoldSeatsMap(companyId);

  const weeklyRows = await loadWeeklyTemplatesForPublicRoute(companyId, depCity, arrCity);

  if (weeklyRows.length === 0) {
    return tripsFromInstancesOnly({
      allInstances,
      holdMap,
      depCity,
      arrCity,
      todayYMD,
      limitCount,
      startAfterCursor,
    });
  }

  const now = new Date();
  type SlotRow = {
    weeklyTripId: string;
    agencyId: string;
    date: string;
    time: string;
    departure: string;
    arrival: string;
    price: number;
    cap: number;
    routeId?: string;
  };
  const slotRows: SlotRow[] = [];

  for (let dayIdx = 0; dayIdx < scheduleDays; dayIdx++) {
    const dayDate = new Date(today);
    dayDate.setHours(0, 0, 0, 0);
    dayDate.setDate(dayDate.getDate() + dayIdx);
    const ymd = toYMD(dayDate);
    const dayName = weekdayFRPublic(dayDate);

    for (const { agencyId, weeklyTripId, wt } of weeklyRows) {
      const horairesRaw = wt.horaires as Record<string, string[]> | undefined;
      const hours = Array.isArray(horairesRaw?.[dayName]) ? horairesRaw![dayName]! : [];
      if (hours.length === 0) continue;

      const wdep = String(wt.departureCity ?? wt.departure ?? "").trim() || depCity;
      const warr = String(wt.arrivalCity ?? wt.arrival ?? "").trim() || arrCity;
      const priceWt = Math.max(0, Number(wt.price ?? 0) || 0);
      const capWt = Math.max(1, Number(wt.places ?? wt.seats ?? 30) || 30);
      const agencyIdWt = String(wt.agencyId ?? agencyId).trim();
      const routeR = wt.routeId;
      const routeIdStr =
        routeR != null && String(routeR).trim() !== "" ? String(routeR).trim() : undefined;

      for (const rawH of hours) {
        const timeNorm = normalizeTripInstanceTime(String(rawH));
        if (!timeNorm) continue;
        const slotDt = new Date(`${ymd}T${timeNorm}:00`);
        if (Number.isNaN(slotDt.getTime())) continue;
        if (slotDt.getTime() <= now.getTime()) continue;

        slotRows.push({
          weeklyTripId,
          agencyId: agencyIdWt,
          date: ymd,
          time: timeNorm,
          departure: wdep,
          arrival: warr,
          price: priceWt,
          cap: capWt,
          routeId: routeIdStr,
        });
      }
    }
  }

  slotRows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

  const byDeterministicId = new Map<string, (typeof allInstances)[0]>();
  const byCompositeKey = new Map<string, (typeof allInstances)[0]>();
  for (const ti of allInstances) {
    byDeterministicId.set(ti.id, ti);
    const wid = String((ti as { weeklyTripId?: string }).weeklyTripId ?? "").trim();
    if (wid) {
      const tStr = normalizeTripInstanceTime(tripInstanceTime(ti));
      const dStr = String((ti as { date?: string }).date ?? "");
      byCompositeKey.set(`${wid}|${dStr}|${tStr}`, ti);
    }
  }

  const merged: ValidTrip[] = [];

  for (const s of slotRows) {
    const wid = s.weeklyTripId;
    const detId = buildTripInstanceId(wid, s.date, s.time);
    const ti =
      byDeterministicId.get(detId) ?? byCompositeKey.get(`${wid}|${s.date}|${s.time}`);
    if (ti && String((ti as { status?: string }).status ?? "").toLowerCase() === "cancelled") {
      continue;
    }

    const departure = String((ti as any)?.departureCity ?? (ti as any)?.departure ?? s.departure).trim();
    const arrival = String((ti as any)?.arrivalCity ?? (ti as any)?.arrival ?? s.arrival).trim();
    let remaining: number;
    let id: string;
    let price = s.price;
    let routeId = s.routeId;

    if (ti) {
      id = String(ti.id);
      const baseRemaining = tripInstanceRemainingFromDoc(ti);
      const holdKey = onlineHoldCompositeKey(id, departure, arrival);
      const held = holdMap.get(holdKey) ?? 0;
      remaining = Math.max(0, baseRemaining - held);
      const p = Number((ti as { price?: unknown }).price ?? 0);
      if (Number.isFinite(p) && p > 0) price = p;
      const r = (ti as { routeId?: unknown }).routeId;
      if (r != null && String(r).trim() !== "") routeId = String(r).trim();
    } else {
      id = detId;
      remaining = s.cap;
    }

    merged.push({
      id,
      date: s.date,
      time: s.time,
      departure,
      arrival,
      price,
      remainingSeats: remaining,
      agencyId: String((ti as any)?.agencyId ?? s.agencyId ?? ""),
      routeId,
      weeklyTripId: wid,
      seatCapacity: s.cap,
    });
  }

  const withSeats = merged.filter((t) => t.remainingSeats > 0);
  withSeats.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));

  const from = startAfterIndex(withSeats, startAfterCursor);
  const page = withSeats.slice(from, from + limitCount);
  const hasMore = from + limitCount < withSeats.length;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last
    ? { date: last.date, time: last.time, id: last.id }
    : null;

  const dates = [...new Set(page.map((t) => t.date))];

  if (import.meta.env?.DEV) {
    console.log("validTrips (weekly + instances):", page.length, "dates:", dates);
  }

  return { validTrips: page, dates, hasMore, nextCursor };
}

function tripsFromInstancesOnly(args: {
  allInstances: Awaited<ReturnType<typeof listTripInstancesByRouteAndDateRange>>;
  holdMap: Map<string, number>;
  depCity: string;
  arrCity: string;
  todayYMD: string;
  limitCount: number;
  startAfterCursor: { date: string; time: string; id: string } | null;
}): {
  validTrips: ValidTrip[];
  dates: string[];
  hasMore: boolean;
  nextCursor: { date: string; time: string; id: string } | null;
} {
  const { allInstances, holdMap, depCity, arrCity, todayYMD, limitCount, startAfterCursor } = args;

  const mapped: ValidTrip[] = allInstances
    .filter((ti) => String((ti as { status?: unknown }).status ?? "").toLowerCase() !== "cancelled")
    .filter((ti) => String(ti.date ?? "") >= todayYMD)
    .map((ti) => {
      const departure = String((ti as any).departureCity ?? (ti as any).departure ?? depCity).trim();
      const arrival = String((ti as any).arrivalCity ?? (ti as any).arrival ?? arrCity).trim();
      const time = String((ti as any).departureTime ?? (ti as any).time ?? "00:00").trim();
      const baseRemaining = tripInstanceRemainingFromDoc(ti);
      const holdKey = onlineHoldCompositeKey(String(ti.id), departure, arrival);
      const held = holdMap.get(holdKey) ?? 0;
      const remainingSeats = Math.max(0, baseRemaining - held);
      const wid = String((ti as { weeklyTripId?: unknown }).weeklyTripId ?? "").trim();
      return {
        id: String(ti.id),
        departure,
        arrival,
        date: String(ti.date ?? ""),
        time,
        price: Number((ti as { price?: unknown }).price ?? 0),
        remainingSeats,
        agencyId: String((ti as { agencyId?: unknown }).agencyId ?? ""),
        routeId: (() => {
          const r = (ti as { routeId?: unknown }).routeId;
          if (r == null || r === "") return undefined;
          const t = String(r).trim();
          return t || undefined;
        })(),
        ...(wid ? { weeklyTripId: wid } : {}),
      };
    })
    .filter((t) => t.remainingSeats > 0);

  mapped.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
  const from = startAfterIndex(mapped, startAfterCursor);
  const page = mapped.slice(from, from + limitCount);
  const hasMore = from + limitCount < mapped.length;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? { date: last.date, time: last.time, id: last.id } : null;
  const dates = page.map((t) => t.date);

  return { validTrips: page, dates, hasMore, nextCursor };
}
