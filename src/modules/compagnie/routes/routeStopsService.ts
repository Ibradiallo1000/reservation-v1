/**
 * Route stops (escales) CRUD.
 * Path: companies/{companyId}/routes/{routeId}/stops/{stopId}
 * Stops are always returned sorted by order (ascending).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ROUTES_COLLECTION, ROUTE_STOPS_SUBCOLLECTION, ROUTE_DIRECTION, type RouteStopDoc, type RouteStopDocWithId, type RouteDirection } from "./routesTypes";
import { withRetryOnQuota } from "@/services/paymentService";
import { getRoute, capitalizeCityName } from "./routesService";

/** Route shape sufficient for direction helpers (startCity/endCity or origin/destination). */
export interface RouteForDirection {
  startCity?: string;
  endCity?: string;
  origin?: string;
  destination?: string;
}

/** Returns origin and destination for display/creation given route and direction. */
export function getRouteOriginAndDestination(
  route: RouteForDirection,
  direction: RouteDirection
): { origin: string; destination: string } {
  const start = (route.startCity ?? route.origin ?? "").trim();
  const end = (route.endCity ?? route.destination ?? "").trim();
  if (direction === ROUTE_DIRECTION.REVERSE) return { origin: end, destination: start };
  return { origin: start, destination: end };
}

/** Returns stops in the correct order for the given direction. forward = as stored (startCity … endCity), reverse = reversed. */
export function getRouteStopsOrdered(
  stops: RouteStopDocWithId[],
  direction: RouteDirection
): RouteStopDocWithId[] {
  if (direction === ROUTE_DIRECTION.REVERSE) return [...stops].reverse();
  return stops;
}

function stopsRef(companyId: string, routeId: string) {
  return collection(db, "companies", companyId, ROUTES_COLLECTION, routeId, ROUTE_STOPS_SUBCOLLECTION);
}

function stopRef(companyId: string, routeId: string, stopId: string) {
  return doc(stopsRef(companyId, routeId), stopId);
}

export interface AddStopParams {
  city: string;
  cityId?: string | null;
  order: number;
  distanceFromStartKm?: number | null;
  estimatedArrivalOffsetMinutes?: number | null;
  boardingAllowed?: boolean;
  dropoffAllowed?: boolean;
}

export interface UpdateStopParams {
  city?: string;
  cityId?: string | null;
  order?: number;
  distanceFromStartKm?: number | null;
  estimatedArrivalOffsetMinutes?: number | null;
  boardingAllowed?: boolean;
  dropoffAllowed?: boolean;
}

/** Get all stops for a route, sorted by order ascending. */
export async function getRouteStops(
  companyId: string,
  routeId: string
): Promise<RouteStopDocWithId[]> {
  const ref = stopsRef(companyId, routeId);
  const q = query(ref, orderBy("order", "asc"));
  const snap = await withRetryOnQuota(() => getDocs(q), 3, "getRouteStops");
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteStopDocWithId));
}

/** Get stops with order strictly greater than the given order and where descent is allowed (destinations possibles depuis une escale). */
export async function getStopsWithOrderGreaterThan(
  companyId: string,
  routeId: string,
  order: number
): Promise<RouteStopDocWithId[]> {
  const all = await getRouteStops(companyId, routeId);
  return all.filter((s) => s.order > order && s.dropoffAllowed !== false);
}

/** Destinations autorisées pour la vente depuis une escale : order > stopOrder ET dropoffAllowed = true. */
export async function getEscaleDestinations(
  companyId: string,
  routeId: string,
  stopOrder: number
): Promise<RouteStopDocWithId[]> {
  const all = await getRouteStops(companyId, routeId);
  return all.filter((s) => s.order > stopOrder && s.dropoffAllowed !== false);
}

/** Retourne le stop à l'ordre donné (pour obtenir la ville d'origine d'une escale). */
export async function getStopByOrder(
  companyId: string,
  routeId: string,
  order: number
): Promise<RouteStopDocWithId | null> {
  const all = await getRouteStops(companyId, routeId);
  return all.find((s) => s.order === order) ?? null;
}

/** Add a stop. Validates: no duplicate order; if order 1, city must equal route.origin; if last position, city must equal route.destination. */
export async function addStop(
  companyId: string,
  routeId: string,
  params: AddStopParams
): Promise<string> {
  const city = capitalizeCityName(params.city || "");
  const order = Math.floor(Number(params.order)) || 0;
  if (!city) throw new Error("La ville de l'escale est obligatoire.");
  if (order < 1) throw new Error("L'ordre doit être >= 1.");

  const route = await getRoute(companyId, routeId);
  if (!route) throw new Error("Route introuvable.");

  const origin = (route.origin ?? route.departureCity ?? "").trim();
  const destination = (route.destination ?? route.arrivalCity ?? "").trim();
  const existing = await getRouteStops(companyId, routeId);

  const hasOrder = existing.some((s) => s.order === order);
  if (hasOrder) throw new Error(`Une escale avec l'ordre ${order} existe déjà.`);

  if (order === 1) {
    if (city.toLowerCase() !== origin.toLowerCase()) {
      throw new Error(`La première escale doit être l'origine de la route (${origin}).`);
    }
  } else if (existing.length === 0) {
    throw new Error("La première escale doit avoir l'ordre 1 (origine).");
  }

  const maxOrder = existing.length === 0 ? 0 : Math.max(...existing.map((s) => s.order));
  if (order > maxOrder && order > 1) {
    if (city.toLowerCase() !== destination.toLowerCase()) {
      throw new Error(`La dernière escale doit être la destination de la route (${destination}).`);
    }
  }

  const ref = doc(stopsRef(companyId, routeId));
  await setDoc(ref, {
    city,
    cityId: params.cityId ?? null,
    order,
    distanceFromStartKm: params.distanceFromStartKm ?? null,
    estimatedArrivalOffsetMinutes: params.estimatedArrivalOffsetMinutes ?? null,
    boardingAllowed: params.boardingAllowed ?? true,
    dropoffAllowed: params.dropoffAllowed ?? true,
  });
  return ref.id;
}

/** Update a stop. Validates no duplicate order if order is changed. */
export async function updateStop(
  companyId: string,
  routeId: string,
  stopId: string,
  params: UpdateStopParams
): Promise<void> {
  const existingStops = await getRouteStops(companyId, routeId);
  const current = existingStops.find((s) => s.id === stopId);
  if (!current) throw new Error("Escale introuvable.");

  const order = params.order !== undefined ? Math.floor(Number(params.order)) : current.order;
  if (order < 1) throw new Error("L'ordre doit être >= 1.");

  if (params.order !== undefined && params.order !== current.order) {
    const hasOrder = existingStops.some((s) => s.id !== stopId && s.order === order);
    if (hasOrder) throw new Error(`Une escale avec l'ordre ${order} existe déjà.`);
  }

  const data: Partial<RouteStopDoc> = {};
  if (params.city !== undefined) data.city = capitalizeCityName(params.city || "");
  if (params.cityId !== undefined) data.cityId = params.cityId ?? null;
  if (params.order !== undefined) data.order = order;
  if (params.distanceFromStartKm !== undefined) data.distanceFromStartKm = params.distanceFromStartKm ?? null;
  if (params.estimatedArrivalOffsetMinutes !== undefined) data.estimatedArrivalOffsetMinutes = params.estimatedArrivalOffsetMinutes ?? null;
  if (params.boardingAllowed !== undefined) data.boardingAllowed = params.boardingAllowed;
  if (params.dropoffAllowed !== undefined) data.dropoffAllowed = params.dropoffAllowed;
  if (Object.keys(data).length === 0) return;

  await updateDoc(stopRef(companyId, routeId, stopId), data);
}

/** Delete a stop. */
export async function deleteStop(
  companyId: string,
  routeId: string,
  stopId: string
): Promise<void> {
  await deleteDoc(stopRef(companyId, routeId, stopId));
}
