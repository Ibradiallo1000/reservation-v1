/**
 * Job serveur : même logique que le client generateTripInstancesFromWeeklyTrips
 * (id déterministe, transaction si absent). Parcourt toutes les compagnies.
 */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { buildSegmentsFromStops, fetchRouteStopCities, type TripInstanceSegment } from "./tripInstanceSegmentHelpers";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/fr";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("fr");

const TRIP_STATUS_SCHEDULED = "scheduled";
const DEFAULT_DAYS = 14;
const DEFAULT_TZ = "Africa/Bamako";

type WeeklyTripDoc = {
  active?: boolean;
  agencyId?: string | null;
  departure?: string;
  arrival?: string;
  departureCity?: string;
  arrivalCity?: string;
  price?: number;
  places?: number;
  seats?: number;
  horaires?: Record<string, string[]>;
  routeId?: string | null;
};

function resolveAgencyTimezone(data: Record<string, unknown> | undefined): string {
  const raw = String(data?.timezone ?? "").trim();
  if (!raw) return DEFAULT_TZ;
  const probe = dayjs.tz("2020-06-15T12:00:00", raw);
  return probe.isValid() ? raw : DEFAULT_TZ;
}

function buildTripInstanceId(weeklyTripId: string, date: string, departureTime: string): string {
  const safeTime = (departureTime || "").replace(":", "-");
  return `${weeklyTripId}_${date}_${safeTime}`;
}

function normalizeHHmm(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

async function ensureTripInstanceDoc(
  db: Firestore,
  companyId: string,
  params: {
    deterministicId: string;
    agencyId: string;
    dep: string;
    arr: string;
    dateStr: string;
    departureTime: string;
    cap: number;
    price: number;
    weeklyTripId: string;
    routeId: string | null;
    createdBy: string;
  }
): Promise<boolean> {
  const {
    deterministicId,
    agencyId,
    dep,
    arr,
    dateStr,
    departureTime,
    cap,
    price,
    weeklyTripId,
    routeId,
    createdBy,
  } = params;

  const ref = db.collection("companies").doc(companyId).collection("tripInstances").doc(deterministicId);

  let stops: string[];
  let segments: TripInstanceSegment[];
  if (routeId) {
    try {
      const cities = await fetchRouteStopCities(db, companyId, routeId);
      if (cities.length >= 2) {
        stops = cities;
        segments = buildSegmentsFromStops(cities, cap);
      } else {
        stops = [dep, arr];
        segments = buildSegmentsFromStops(stops, cap);
      }
    } catch (e) {
      functions.logger.warn("ensureTripInstanceDoc: route stops fetch failed, fallback dep/arr", {
        companyId,
        routeId,
        e,
      });
      stops = [dep, arr];
      segments = buildSegmentsFromStops(stops, cap);
    }
  } else {
    stops = [dep, arr];
    segments = buildSegmentsFromStops(stops, cap);
  }

  const bottleneckRemaining =
    segments.length > 0 ? Math.min(...segments.map((s) => Math.max(0, Number(s.remaining) || 0))) : cap;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    const departureDate = admin.firestore.Timestamp.fromDate(new Date(`${dateStr}T00:00:00.000Z`));
    const now = admin.firestore.FieldValue.serverTimestamp();
    const data: Record<string, unknown> = {
      companyId,
      agencyId,
      capacity: cap,
      departure: dep,
      arrival: arr,
      time: departureTime,
      remainingSeats: bottleneckRemaining,
      stops,
      segments,
      routeDeparture: dep,
      routeArrival: arr,
      weeklyTripId,
      vehicleId: null,
      date: dateStr,
      departureDate,
      departureTime,
      status: TRIP_STATUS_SCHEDULED,
      passengerCount: 0,
      parcelCount: 0,
      createdAt: now,
      createdBy,
      updatedAt: now,
      departureCity: dep,
      arrivalCity: arr,
      seatCapacity: cap,
      reservedSeats: 0,
      routeId: routeId ?? null,
      price: price ?? null,
    };
    if (cap > 0) data.capacitySeats = cap;
    tx.set(ref, data);
    return true;
  });
}

export async function runGenerateTripInstancesForCompany(
  db: Firestore,
  companyId: string,
  daysAhead: number = DEFAULT_DAYS
): Promise<{ created: number; skipped: number; errors: number }> {
  let created = 0;
  let skipped = 0;
  let errors = 0;
  const nDays = Math.max(1, Math.min(60, daysAhead));
  const createdBy = "scheduledGenerateTripInstancesFromWeeklyTrips";

  const agenciesSnap = await db.collection("companies").doc(companyId).collection("agences").get();

  for (const agDoc of agenciesSnap.docs) {
    const agencyId = agDoc.id;
    const tz = resolveAgencyTimezone(agDoc.data() as Record<string, unknown>);

    let tripsSnap;
    try {
      tripsSnap = await agDoc.ref.collection("weeklyTrips").get();
    } catch (e) {
      functions.logger.warn("weeklyTrips read failed", { companyId, agencyId, e });
      errors++;
      continue;
    }

    for (const tripDoc of tripsSnap.docs) {
      const wt = tripDoc.data() as WeeklyTripDoc;
      if (wt.active === false) continue;

      const weeklyTripId = tripDoc.id;
      const wtAgencyId = (String(wt.agencyId || agencyId).trim() || agencyId) as string;
      const dep = String(wt.departureCity ?? wt.departure ?? "").trim();
      const arr = String(wt.arrivalCity ?? wt.arrival ?? "").trim();
      if (!dep || !arr || dep.toLowerCase() === arr.toLowerCase()) continue;

      const price = typeof wt.price === "number" ? wt.price : Number(wt.price) || 0;
      const places = Math.max(0, Number(wt.places ?? wt.seats ?? 30) || 30);
      const horaires = wt.horaires || {};
      const routeId = wt.routeId ?? null;

      for (let i = 0; i < nDays; i++) {
        const cursor = dayjs().tz(tz).startOf("day").add(i, "day");
        const dateStr = cursor.format("YYYY-MM-DD");
        const weekdayFr = cursor.format("dddd").toLowerCase();
        const slots = horaires[weekdayFr] || [];

        for (const rawTime of slots) {
          const departureTime = normalizeHHmm(rawTime);
          if (!departureTime) {
            skipped++;
            continue;
          }

          const deterministicId = buildTripInstanceId(weeklyTripId, dateStr, departureTime);
          try {
            const did = await ensureTripInstanceDoc(db, companyId, {
              deterministicId,
              agencyId: wtAgencyId,
              dep,
              arr,
              dateStr,
              departureTime,
              cap: places,
              price,
              weeklyTripId,
              routeId,
              createdBy,
            });
            if (did) created++;
            else skipped++;
          } catch (e) {
            functions.logger.warn("ensureTripInstanceDoc failed", { companyId, deterministicId, e });
            errors++;
          }
        }
      }
    }
  }

  return { created, skipped, errors };
}

export async function runGenerateTripInstancesForAllCompanies(): Promise<void> {
  const db = admin.firestore();
  const companiesSnap = await db.collection("companies").get();
  let totalCreated = 0;
  let totalErrors = 0;

  for (const cDoc of companiesSnap.docs) {
    try {
      const r = await runGenerateTripInstancesForCompany(db, cDoc.id, DEFAULT_DAYS);
      totalCreated += r.created;
      totalErrors += r.errors;
      functions.logger.info("generateTripInstances company done", {
        companyId: cDoc.id,
        ...r,
      });
    } catch (e) {
      totalErrors++;
      functions.logger.error("generateTripInstances company failed", cDoc.id, e);
    }
  }

  functions.logger.info("generateTripInstances ALL done", { totalCreated, totalErrors });
}
