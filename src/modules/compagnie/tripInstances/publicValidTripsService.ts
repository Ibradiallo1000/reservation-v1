/**
 * Génération des trajets publics à partir des instances réelles.
 * Pour chaque weeklyTrip, on génère les instances sur les 14 prochains jours
 * uniquement si weeklyTrip.horaires[day] existe. Les jours et horaires affichés
 * sont dérivés de validTrips (aucune projection vide, cohérence agencyId/companyId).
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  getOrCreateTripInstanceForSlot,
  listTripInstancesByRouteAndDate,
} from "./tripInstanceService";

const DAYS: Record<number, string> = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface WeeklyTripLike {
  id: string;
  departure?: string;
  depart?: string;
  arrival?: string;
  arrivee?: string;
  departureCity?: string;
  arrivalCity?: string;
  horaires?: Record<string, string[]>;
  places?: number;
  seats?: number;
  price?: number;
  routeId?: string | null;
}

export interface ValidTrip {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  places: number;
  remainingSeats: number;
  agencyId: string;
  companyId: string;
  routeId?: string | null;
}

export interface BuildValidTripsParams {
  companyId: string;
  depNorm: string;
  arrNorm: string;
  /** Normalise une chaîne pour comparaison (ex: trim + lowercase). */
  normalize: (s: string) => string;
  /** Liste des agences (au moins { id }). */
  agences: Array<{ id: string }>;
  /** Nombre de jours à couvrir à partir d'aujourd'hui (défaut 14). */
  daysAhead?: number;
  /** Pour filtrer les créneaux passés aujourd'hui. Retourne true si (dateStr, time) est passé. */
  isPastTime?: (dateStr: string, time: string) => boolean;
  /** Calcule les places restantes pour une instance. Si absent, utilise capacity - reservedSeats. */
  getRemaining?: (companyId: string, instanceId: string, ti: Record<string, unknown>) => Promise<number>;
}

/** Slot à créer : (agence, weekly, date, heure) */
interface SlotToCreate {
  agencyId: string;
  weekly: WeeklyTripLike;
  dateStr: string;
  heure: string;
}

/**
 * Pour chaque weeklyTrip (par agence), génère les instances réelles sur les jours
 * où horaires[day] existe. Puis construit validTrips avec remaining > 0 et non passés.
 * Optimisé : chargement weeklyTrips en parallèle, création des slots en parallèle, listing par date en parallèle.
 */
export async function buildValidTripsFromWeeklyTrips(
  params: BuildValidTripsParams
): Promise<{ validTrips: ValidTrip[]; dates: string[] }> {
  const {
    companyId,
    depNorm,
    arrNorm,
    normalize,
    agences,
    daysAhead = 14,
    isPastTime = () => false,
    getRemaining,
  } = params;

  const today = new Date();
  const todayYMD = toYMD(today);
  const depNormN = normalize(depNorm);
  const arrNormN = normalize(arrNorm);

  // 1) Charger tous les weeklyTrips de toutes les agences en parallèle
  const weeklySnapshots = await Promise.all(
    agences.map((agence) =>
      getDocs(
        query(
          collection(db, "companies", companyId, "agences", agence.id, "weeklyTrips"),
          where("active", "==", true)
        )
      )
    )
  );

  // 2) Construire la liste de tous les slots à créer (sans await)
  const slotsToCreate: SlotToCreate[] = [];
  const dateStrSet = new Set<string>();

  for (let a = 0; a < agences.length; a++) {
    const agence = agences[a];
    const wSnap = weeklySnapshots[a];
    const weekly = wSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as WeeklyTripLike));
    for (const t of weekly) {
      const tripDep = normalize(t.departureCity ?? t.departure ?? t.depart ?? "");
      const tripArr = normalize(t.arrivalCity ?? t.arrival ?? t.arrivee ?? "");
      if (tripDep !== depNormN || tripArr !== arrNormN) continue;

      const horaires = t.horaires || {};
      for (let i = 0; i < daysAhead; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        const dateStr = toYMD(d);
        const dayName = DAYS[d.getDay()];
        const slots = horaires[dayName];
        if (!Array.isArray(slots) || slots.length === 0) continue;

        for (const heure of slots) {
          if (dateStr === todayYMD && isPastTime(dateStr, heure)) continue;
          slotsToCreate.push({ agencyId: agence.id, weekly: t, dateStr, heure });
          dateStrSet.add(dateStr);
        }
      }
    }
  }

  // 3) Créer toutes les instances en parallèle
  await Promise.all(
    slotsToCreate.map(({ agencyId, weekly, dateStr, heure }) =>
      getOrCreateTripInstanceForSlot(companyId, {
        agencyId,
        departureCity: depNorm.trim(),
        arrivalCity: arrNorm.trim(),
        date: dateStr,
        departureTime: heure,
        seatCapacity: weekly.seats ?? weekly.places ?? 30,
        price: weekly.price ?? null,
        weeklyTripId: weekly.id,
        routeId: weekly.routeId ?? null,
      })
    )
  );

  // 4) Lister les instances pour toutes les dates en parallèle
  const dateStrArray = [...dateStrSet];
  const instancesByDate = await Promise.all(
    dateStrArray.map((dateStr) =>
      listTripInstancesByRouteAndDate(companyId, depNorm, arrNorm, dateStr)
    )
  );

  // 5) Construire validTrips (remaining en parallèle si getRemaining fourni)
  const allInstances = instancesByDate.flat();
  const withRemaining =
    getRemaining != null
      ? await Promise.all(
          allInstances.map(async (ti) => {
            const data = ti as unknown as Record<string, unknown>;
            const remaining = await getRemaining(companyId, ti.id, data);
            return { ti, data, remaining };
          })
        )
      : allInstances.map((ti) => {
          const data = ti as unknown as Record<string, unknown>;
          const capacity = (data.seatCapacity ?? data.capacitySeats ?? 30) as number;
          const reserved = (data.reservedSeats ?? 0) as number;
          return { ti, data, remaining: Math.max(0, capacity - reserved) };
        });

  const validTrips: ValidTrip[] = [];
  for (const { ti, data, remaining } of withRemaining) {
    if (data.status === "cancelled") continue;
    if (remaining <= 0) continue;
    const dateStr = ti.date;
    if (dateStr === todayYMD && isPastTime(dateStr, (data.departureTime as string) ?? "00:00"))
      continue;

    const capacity = (data.seatCapacity ?? data.capacitySeats ?? 30) as number;
    validTrips.push({
      id: ti.id,
      date: ti.date,
      time: (data.departureTime as string) ?? "",
      departure: (data.departureCity ?? data.routeDeparture ?? depNorm) as string,
      arrival: (data.arrivalCity ?? data.routeArrival ?? arrNorm) as string,
      price: (data.price as number) ?? 0,
      places: capacity,
      remainingSeats: remaining,
      agencyId: ti.agencyId,
      companyId,
      routeId: (data.routeId as string | null) ?? null,
    });
  }

  validTrips.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const dates = [...new Set(validTrips.map((t) => t.date))].sort();

  if (import.meta.env?.DEV) {
    console.log(
      "validTrips (trajets réels):",
      validTrips.length,
      "dates dérivées:",
      dates.length,
      dates
    );
  }
  return { validTrips, dates };
}
