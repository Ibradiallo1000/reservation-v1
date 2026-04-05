/**
 * Résolution stable stopId ↔ order sur une route (migration progressive stopOrder → stopId).
 * Ne supprime pas stopOrder : toujours combiner avec fallback.
 */

import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { getRouteStops } from "./routeStopsService";

function normalizeCity(city: string): string {
  return (city ?? "").trim().toLowerCase();
}

/** Ordre des stops à partir des villes (copie locale pour éviter dépendance circulaire avec segmentOccupancyService). */
async function resolveStopOrdersFromCities(
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
 * Résout le document stop pour un ordre sur la route (et optionnellement vérifie la ville).
 */
export async function resolveStop(
  companyId: string,
  routeId: string,
  stopOrder: number,
  city?: string | null
): Promise<{ stopId: string; order: number } | null> {
  const stops = await getRouteStops(companyId, routeId);
  const orderNum = Math.floor(Number(stopOrder));
  if (!Number.isFinite(orderNum) || orderNum < 1) return null;
  let match = stops.find((s) => s.order === orderNum);
  if (city != null && String(city).trim() !== "") {
    const cn = normalizeCity(String(city));
    const refined = stops.find((s) => s.order === orderNum && normalizeCity(s.city ?? "") === cn);
    if (refined) match = refined;
  }
  if (!match) return null;
  return { stopId: match.id, order: match.order };
}

export async function resolveStopByStopId(
  companyId: string,
  routeId: string,
  stopId: string
): Promise<{ stopId: string; order: number } | null> {
  const sid = String(stopId ?? "").trim();
  if (!sid) return null;
  const stops = await getRouteStops(companyId, routeId);
  const match = stops.find((s) => s.id === sid);
  if (!match) return null;
  return { stopId: match.id, order: match.order };
}

/**
 * Si stopId et stopOrder sont tous deux renseignés, vérifie qu’ils pointent vers le même stop sur la route.
 * Ne bloque pas le flux — log seulement (observabilité incohérences données).
 */
export async function warnIfStopIdOrderMismatch(
  companyId: string,
  routeId: string,
  stopId: string | null | undefined,
  stopOrder: number | null | undefined
): Promise<void> {
  const sid = stopId != null ? String(stopId).trim() : "";
  const ord = stopOrder != null ? Math.floor(Number(stopOrder)) : NaN;
  if (!sid || !Number.isFinite(ord) || ord < 1) return;
  const resolved = await resolveStopByStopId(companyId, routeId, sid);
  if (!resolved) return;
  if (resolved.order !== ord) {
    console.error("STOP_INCONSISTENCY", { stopId: sid, stopOrder: ord });
  }
}

/** Ordre de l’escale pour l’agence (document agence type escale), avec fallback stopId → order sur la route. */
export function effectiveAgencyEscaleStopOrder(
  agency: { type?: string; stopOrder?: unknown; stopId?: unknown } | null | undefined,
  idToOrder: Map<string, number>
): number | null {
  if (!agency || String(agency.type ?? "").toLowerCase() !== "escale") return null;
  const o = agency.stopOrder != null ? Number(agency.stopOrder) : NaN;
  if (Number.isFinite(o) && o >= 1) return Math.floor(o);
  const sid = agency.stopId != null ? String(agency.stopId).trim() : "";
  if (sid && idToOrder.has(sid)) return idToOrder.get(sid)!;
  return null;
}

/** Origine / destination avec stopId + order (double écriture réservation). */
export async function resolveJourneyStopIdsFromCities(
  companyId: string,
  routeId: string,
  depart: string,
  arrivee: string
): Promise<{
  originStopId: string;
  destinationStopId: string;
  originStopOrder: number;
  destinationStopOrder: number;
} | null> {
  const orders = await resolveStopOrdersFromCities(companyId, routeId, depart, arrivee);
  if (!orders) return null;
  const origin = await resolveStop(companyId, routeId, orders.originStopOrder, depart);
  const dest = await resolveStop(companyId, routeId, orders.destinationStopOrder, arrivee);
  if (!origin || !dest) return null;
  return {
    originStopId: origin.stopId,
    destinationStopId: dest.stopId,
    originStopOrder: orders.originStopOrder,
    destinationStopOrder: orders.destinationStopOrder,
  };
}

export function buildStopIdToOrderMap(stops: Array<{ id: string; order: number }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stops) m.set(s.id, Math.floor(Number(s.order)));
  return m;
}

export function effectiveOriginStopOrder(
  data: { originStopOrder?: unknown; originStopId?: unknown },
  idToOrder: Map<string, number>
): number | null {
  const o = data.originStopOrder != null ? Number(data.originStopOrder) : NaN;
  if (Number.isFinite(o) && o >= 1) return Math.floor(o);
  const sid = data.originStopId != null ? String(data.originStopId).trim() : "";
  if (sid && idToOrder.has(sid)) return idToOrder.get(sid)!;
  return null;
}

export function effectiveDestinationStopOrder(
  data: { destinationStopOrder?: unknown; destinationStopId?: unknown },
  idToOrder: Map<string, number>
): number | null {
  const o = data.destinationStopOrder != null ? Number(data.destinationStopOrder) : NaN;
  if (Number.isFinite(o) && o >= 1) return Math.floor(o);
  const sid = data.destinationStopId != null ? String(data.destinationStopId).trim() : "";
  if (sid && idToOrder.has(sid)) return idToOrder.get(sid)!;
  return null;
}

/** Filtre embarquement escale : origine ≤ escale < destination (avec fallback stopId). */
export function reservationBoardingWindowAtStop(
  row: Record<string, unknown>,
  agencyStopOrder: number,
  idToOrder: Map<string, number>
): boolean {
  const oo = effectiveOriginStopOrder(row, idToOrder);
  const dd = effectiveDestinationStopOrder(row, idToOrder);
  if (oo == null || dd == null) return false;
  return oo <= agencyStopOrder && dd > agencyStopOrder;
}

export function reservationDropoffAtStop(
  row: Record<string, unknown>,
  agencyStopOrder: number,
  idToOrder: Map<string, number>
): boolean {
  const dd = effectiveDestinationStopOrder(row, idToOrder);
  return dd != null && dd === agencyStopOrder;
}

export function reservationOvertravelPastStop(
  row: Record<string, unknown>,
  agencyStopOrder: number,
  idToOrder: Map<string, number>
): boolean {
  const dd = effectiveDestinationStopOrder(row, idToOrder);
  return dd != null && dd < agencyStopOrder;
}

/** Fusionne deux listes de documents Firestore sans doublon d'id. */
export function mergeQueryDocsUnique(
  a: QueryDocumentSnapshot<DocumentData>[],
  b: QueryDocumentSnapshot<DocumentData>[]
): QueryDocumentSnapshot<DocumentData>[] {
  const map = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const d of a) map.set(d.id, d);
  for (const d of b) if (!map.has(d.id)) map.set(d.id, d);
  return [...map.values()];
}
