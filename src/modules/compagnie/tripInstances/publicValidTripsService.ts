/**
 * Liste des trajets publics à partir des tripInstances déjà créées (aucune écriture côté client).
 * Requête unique sur la fenêtre [today, today+N], sans boucle par jour.
 */

import { listTripInstancesByRouteAndDateRange } from "./tripInstanceService";
import { fetchPendingOnlineHoldSeatsMap, onlineHoldCompositeKey } from "./onlineReservationHolds";
import { tripInstanceRemainingFromDoc } from "./tripInstanceTypes";

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
}

export interface BuildValidTripsParams {
  companyId: string;
  depNorm: string;
  arrNorm: string;
  /** Conservé pour compatibilité des appelants ; non utilisé. */
  normalize?: (s: string) => string;
  /** Nombre de jours à couvrir à partir d'aujourd'hui (défaut 14). */
  daysAhead?: number;
  /** Nombre max de résultats renvoyés par la requête unique (défaut 100). */
  limitCount?: number;
  /** Curseur pour charger la page suivante. */
  startAfterCursor?: { date: string; time: string; id: string } | null;
}

/**
 * Lit uniquement les tripInstances existantes (ville départ / arrivée / date).
 * Aucune création : si le planning n’a pas été matérialisé en instances, la liste est vide.
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
    /** Aligné guichet (AgenceGuichetPage DAYS_IN_ADVANCE). */
    daysAhead = 8,
    // Limiter pour perf, mais éviter de cacher des trajets.
    limitCount = 100,
    startAfterCursor = null,
  } = params;

  const today = new Date();
  const todayYMD = toYMD(today);
  const depCity = depNorm.trim();
  const arrCity = arrNorm.trim();

  const to = new Date(today);
  to.setDate(today.getDate() + Math.max(0, daysAhead));
  const dateFrom = todayYMD;
  const dateTo = toYMD(to);

  const allInstances = await listTripInstancesByRouteAndDateRange(
    companyId,
    depCity,
    arrCity,
    dateFrom,
    dateTo,
    { limitCount, startAfterCursor: startAfterCursor ?? undefined }
  );
  const holdMap = await fetchPendingOnlineHoldSeatsMap(companyId);
  const validTrips: ValidTrip[] = allInstances
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
      return {
        id: String(ti.id),
        departure,
        arrival,
        date: String(ti.date ?? ""),
        time,
        price: Number((ti as { price?: unknown }).price ?? 0),
        remainingSeats,
        agencyId: String(ti.agencyId ?? ""),
        routeId: (() => {
          const r = (ti as { routeId?: unknown }).routeId;
          if (r == null || r === "") return undefined;
          const t = String(r).trim();
          return t || undefined;
        })(),
      };
    })
    .filter((t) => t.remainingSeats > 0);

  const dates = validTrips.map((t) => t.date);

  if (import.meta.env?.DEV) {
    console.log(
      "validTrips (instances existantes uniquement):",
      validTrips.length,
      "dates:",
      dates.length,
      dates
    );
  }
  const last = allInstances[allInstances.length - 1];
  const nextCursor = last
    ? {
        date: String(last.date ?? ""),
        time: String((last as any).departureTime ?? (last as any).time ?? "00:00").trim(),
        id: String(last.id),
      }
    : null;
  const hasMore = allInstances.length >= limitCount;
  return { validTrips, dates, hasMore, nextCursor };
}
