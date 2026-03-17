/**
 * Segment-based occupancy for trip instances with stops (escales).
 * remainingSeats = seatCapacity - max(segment occupancies).
 * Reservations carry originStopOrder and destinationStopOrder; when absent, we resolve from depart/arrivee when route has stops.
 */

import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getTripInstance } from "./tripInstanceService";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import { getReservedPlaces } from "./remainingPlacesUtils";

const CONFIRMED_STATUTS = ["paye", "payé", "confirme", "confirmé", "validé"];

function normalizeCity(city: string): string {
  return (city ?? "").trim().toLowerCase();
}

/**
 * Resolve origin and destination city names to stop orders on the route.
 * Returns null if route has no stops or city not found.
 */
export async function getStopOrdersFromCities(
  companyId: string,
  routeId: string,
  depart: string,
  arrivee: string
): Promise<{ originStopOrder: number; destinationStopOrder: number } | null> {
  const stops = await getRouteStops(companyId, routeId);
  if (stops.length < 2) return null;
  const depNorm = normalizeCity(depart);
  const arrNorm = normalizeCity(arrivee);
  const originStop = stops.find((s) => normalizeCity(s.city ?? "") === depNorm);
  const destStop = stops.find((s) => normalizeCity(s.city ?? "") === arrNorm);
  if (!originStop || !destStop) return null;
  if (originStop.order >= destStop.order) return null;
  return { originStopOrder: originStop.order, destinationStopOrder: destStop.order };
}

/**
 * Compute per-segment occupancy for a trip instance.
 * Segments are stop[i] → stop[i+1]; segment index i = 0..(stops.length - 2).
 * A reservation from originStopOrder to destinationStopOrder occupies segments
 * from index (originStopOrder - 1) to (destinationStopOrder - 2) inclusive.
 * Returns array of occupancy per segment, or null if trip has no route/stops.
 */
export async function computeSegmentOccupancy(
  companyId: string,
  tripInstanceId: string
): Promise<number[] | null> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) return null;
  const routeId = (ti as { routeId?: string | null }).routeId ?? null;
  if (!routeId) return null;

  const stops = await getRouteStops(companyId, routeId);
  if (stops.length < 2) return null;

  const numSegments = stops.length - 1;
  const occupancy = new Array<number>(numSegments).fill(0);

  // Requires Firestore collection group index: reservations, tripInstanceId (ASC)
  const resSnap = await getDocs(
    query(
      collectionGroup(db, "reservations"),
      where("tripInstanceId", "==", tripInstanceId)
    )
  );

  for (let i = 0; i < resSnap.docs.length; i++) {
    const docData = resSnap.docs[i].data() as Record<string, unknown>;
    const statut = (docData.statut ?? "").toString().toLowerCase();
    if (!CONFIRMED_STATUTS.includes(statut)) continue;
    const boardingStatus = (docData.boardingStatus ?? "pending").toString().toLowerCase();
    if (boardingStatus === "no_show") continue;

    let originOrder: number;
    let destOrder: number;
    const o = docData.originStopOrder != null ? Number(docData.originStopOrder) : null;
    const d = docData.destinationStopOrder != null ? Number(docData.destinationStopOrder) : null;
    if (o != null && d != null && Number.isInteger(o) && Number.isInteger(d) && o < d) {
      originOrder = o;
      destOrder = d;
    } else {
      const depart = (docData.depart ?? "").toString().trim();
      const arrivee = (docData.arrivee ?? "").toString().trim();
      const resolved = await getStopOrdersFromCities(companyId, routeId, depart, arrivee);
      if (!resolved) continue;
      originOrder = resolved.originStopOrder;
      destOrder = resolved.destinationStopOrder;
    }

    const seats = Number(docData.seatsGo ?? 1) + Number(docData.seatsReturn ?? 0);
    if (seats <= 0) continue;

    const segmentStart = originOrder - 1;
    const segmentEnd = destOrder - 2;
    for (let s = segmentStart; s <= segmentEnd; s++) {
      if (s >= 0 && s < numSegments) occupancy[s] += seats;
    }
  }

  return occupancy;
}

/**
 * Nombre de places réservées pour une instance (somme des places des réservations confirmées).
 * Source unique : les réservations Firestore, pas le champ reservedSeats (évite 56 vs 57).
 */
export async function getReservedSeatsForTripInstance(
  companyId: string,
  tripInstanceId: string
): Promise<number> {
  const resSnap = await getDocs(
    query(
      collectionGroup(db, "reservations"),
      where("tripInstanceId", "==", tripInstanceId)
    )
  );
  const list = resSnap.docs
    .map((d) => d.data() as { statut?: string; boardingStatus?: string; seatsGo?: number; seatsReturn?: number; places?: number })
    .filter((r) => {
      if (!CONFIRMED_STATUTS.includes((r.statut ?? "").toString().toLowerCase())) return false;
      if ((r.boardingStatus ?? "pending").toString().toLowerCase() === "no_show") return false;
      return true;
    });
  return getReservedPlaces(list);
}

/**
 * Remaining seats = seatCapacity - max(segment occupancies) si route avec stops,
 * sinon seatCapacity - somme des places des réservations (plus de fallback reservedSeats pour l’affichage).
 */
export async function getRemainingSeats(
  companyId: string,
  tripInstanceId: string
): Promise<number> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) return 0;
  const capacity = (ti as { seatCapacity?: number; capacitySeats?: number }).seatCapacity
    ?? (ti as { capacitySeats?: number }).capacitySeats ?? 0;
  if (capacity <= 0) return 0;

  const occupancy = await computeSegmentOccupancy(companyId, tripInstanceId);
  if (occupancy == null || occupancy.length === 0) {
    const reserved = await getReservedSeatsForTripInstance(companyId, tripInstanceId);
    return Math.max(0, capacity - reserved);
  }
  const maxOccupancy = Math.max(0, ...occupancy);
  return Math.max(0, capacity - maxOccupancy);
}
