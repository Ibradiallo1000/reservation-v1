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

/**
 * Pour chaque weeklyTrip (par agence), génère les instances réelles sur les jours
 * où horaires[day] existe. Puis construit validTrips avec remaining > 0 et non passés,
 * et dérive les dates affichables de validTrips (aucun jour vide).
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

  // 1) Par agence et par weeklyTrip : créer/assurer les instances pour les jours où horaires[day] existe
  const dateStrSet = new Set<string>();
  for (const agence of agences) {
    const wSnap = await getDocs(
      query(
        collection(db, "companies", companyId, "agences", agence.id, "weeklyTrips"),
        where("active", "==", true)
      )
    );
    const weekly = wSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as WeeklyTripLike));
    for (const t of weekly) {
      const tripDep = normalize(t.departureCity ?? t.departure ?? t.depart ?? "");
      const tripArr = normalize(t.arrivalCity ?? t.arrival ?? t.arrivee ?? "");
      if (tripDep !== normalize(depNorm) || tripArr !== normalize(arrNorm)) continue;

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
          await getOrCreateTripInstanceForSlot(companyId, {
            agencyId: agence.id,
            departureCity: depNorm.trim(),
            arrivalCity: arrNorm.trim(),
            date: dateStr,
            departureTime: heure,
            seatCapacity: t.seats ?? t.places ?? 30,
            price: t.price ?? null,
            weeklyTripId: t.id,
            routeId: t.routeId ?? null,
          });
          dateStrSet.add(dateStr);
        }
      }
    }
  }

  // 2) Pour chaque date concernée, lister les instances et calculer remaining
  const validTrips: ValidTrip[] = [];
  for (const dateStr of dateStrSet) {
    const instances = await listTripInstancesByRouteAndDate(companyId, depNorm, arrNorm, dateStr);
    for (const ti of instances) {
      const data = ti as unknown as Record<string, unknown>;
      if (data.status === "cancelled") continue;
      const capacity = (data.seatCapacity ?? data.capacitySeats ?? 30) as number;
      const reserved = (data.reservedSeats ?? 0) as number;
      const remaining =
        getRemaining != null
          ? await getRemaining(companyId, ti.id, data)
          : Math.max(0, capacity - reserved);
      if (remaining <= 0) continue;
      if (dateStr === todayYMD && isPastTime(dateStr, (data.departureTime as string) ?? "00:00"))
        continue;

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
  }

  validTrips.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  const dates = [...new Set(validTrips.map((t) => t.date))].sort();

  console.log(
    "validTrips (trajets réels):",
    validTrips.length,
    "dates dérivées:",
    dates.length,
    dates
  );
  return { validTrips, dates };
}
