/**
 * Matérialise les tripInstances pour les N prochains jours à partir des weeklyTrips actifs
 * de toutes les agences de la compagnie. Création idempotente : id déterministe
 * buildTripInstanceId(weeklyTripId, date, heure) — aucune duplication.
 *
 * À combiner avec un job planifié (Cloud Function) et/ou un déclenchement manuel côté admin.
 */

import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/fr";
import { resolveAgencyTimezone, DEFAULT_AGENCY_TIMEZONE } from "@/shared/date/dateUtilsTz";
import {
  buildTripInstanceId,
  createTripInstance,
  type CreateTripInstanceParams,
} from "./tripInstanceService";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("fr");

export const DEFAULT_TRIP_INSTANCE_GENERATION_DAYS = 14;

export interface GenerateTripInstancesFromWeeklyTripsOptions {
  /** Nombre de jours à couvrir à partir d’aujourd’hui (calendrier agence), défaut 14, max 60 */
  daysAhead?: number;
  /** Si l’agence n’a pas de champ timezone IANA valide */
  fallbackTimezone?: string;
  createdBy?: string;
}

export interface GenerateTripInstancesFromWeeklyTripsResult {
  created: number;
  skipped: number;
  errors: number;
}

/** Normalise une heure saisie (ex. "8:30" → "08:30") pour cohérence des requêtes et de l’id. */
export function normalizeTripInstanceTime(raw: string): string {
  const s = (raw || "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

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

/**
 * Pour chaque agence : weeklyTrips avec active !== false ; pour chaque jour sur `daysAhead`,
 * pour chaque horaire du jour (clés françaises : lundi, mardi, …) : ensure tripInstance avec id déterministe.
 */
export async function generateTripInstancesFromWeeklyTrips(
  companyId: string,
  options?: GenerateTripInstancesFromWeeklyTripsOptions
): Promise<GenerateTripInstancesFromWeeklyTripsResult> {
  if (!companyId?.trim()) {
    return { created: 0, skipped: 0, errors: 0 };
  }

  const daysAhead = Math.max(1, Math.min(60, options?.daysAhead ?? DEFAULT_TRIP_INSTANCE_GENERATION_DAYS));
  const fallbackTz = options?.fallbackTimezone ?? DEFAULT_AGENCY_TIMEZONE;
  const createdBy = options?.createdBy ?? "generateTripInstancesFromWeeklyTrips";

  let created = 0;
  let skipped = 0;
  let errors = 0;

  const agenciesSnap = await getDocs(collection(db, "companies", companyId, "agences"));

  for (const agDoc of agenciesSnap.docs) {
    const agencyId = agDoc.id;
    const tz = resolveAgencyTimezone(agDoc.data() as { timezone?: string | null }) || fallbackTz;

    let tripsSnap;
    try {
      tripsSnap = await getDocs(collection(db, "companies", companyId, "agences", agencyId, "weeklyTrips"));
    } catch {
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

      for (let i = 0; i < daysAhead; i++) {
        const cursor = dayjs().tz(tz).startOf("day").add(i, "day");
        const dateStr = cursor.format("YYYY-MM-DD");
        const weekdayFr = cursor.format("dddd").toLowerCase();
        const slots = horaires[weekdayFr] || [];

        for (const rawTime of slots) {
          const departureTime = normalizeTripInstanceTime(rawTime);
          if (!departureTime) {
            skipped++;
            continue;
          }

          const deterministicId = buildTripInstanceId(weeklyTripId, dateStr, departureTime);
          const params: CreateTripInstanceParams = {
            agencyId: wtAgencyId,
            departureCity: dep,
            arrivalCity: arr,
            date: dateStr,
            departureTime,
            seatCapacity: places,
            capacitySeats: places,
            price,
            weeklyTripId,
            routeId: routeId ?? undefined,
            vehicleId: null,
            createdBy,
          };

          try {
            const { created: didCreate } = await createTripInstance(companyId, params, deterministicId);
            if (didCreate) created++;
            else skipped++;
          } catch {
            errors++;
          }
        }
      }
    }
  }

  return { created, skipped, errors };
}
