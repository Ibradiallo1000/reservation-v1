/**
 * Company routes CRUD.
 * Path: companies/{companyId}/routes/{routeId}
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
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ROUTES_COLLECTION, ROUTE_STOPS_SUBCOLLECTION, ROUTE_STATUS, type RouteDoc, type RouteStatus } from "./routesTypes";

function routesRef(companyId: string) {
  return collection(db, "companies", companyId, ROUTES_COLLECTION);
}

function routeRef(companyId: string, routeId: string) {
  return doc(db, "companies", companyId, ROUTES_COLLECTION, routeId);
}

export interface CreateRouteParams {
  /** Origin city (or use departureCity for compat). */
  origin?: string;
  /** Destination city (or use arrivalCity for compat). */
  destination?: string;
  departureCity?: string;
  arrivalCity?: string;
  distanceKm?: number | null;
  estimatedDurationMinutes?: number | null;
  distance?: number | null;
  estimatedDuration?: number | null;
}

/** Normalise le nom de ville : première lettre en majuscule, reste en minuscules (ex: "bamako" → "Bamako", "BOUGOUNI" → "Bougouni"). */
export function capitalizeCityName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function normOrigin(params: CreateRouteParams): string {
  return capitalizeCityName(params.origin ?? params.departureCity ?? "");
}
function normDest(params: CreateRouteParams): string {
  return capitalizeCityName(params.destination ?? params.arrivalCity ?? "");
}

/** Create a route (status ACTIVE). Returns the new document id. */
export async function createRoute(
  companyId: string,
  params: CreateRouteParams
): Promise<string> {
  const origin = normOrigin(params);
  const dest = normDest(params);
  if (!origin || !dest) throw new Error("Origin et destination sont obligatoires.");
  const ref = doc(routesRef(companyId));
  await setDoc(ref, {
    origin,
    destination: dest,
    distanceKm: params.distanceKm ?? params.distance ?? null,
    estimatedDurationMinutes: params.estimatedDurationMinutes ?? params.estimatedDuration ?? null,
    departureCity: origin,
    arrivalCity: dest,
    distance: params.distanceKm ?? params.distance ?? null,
    estimatedDuration: params.estimatedDurationMinutes ?? params.estimatedDuration ?? null,
    status: ROUTE_STATUS.ACTIVE,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Update a route. */
export async function updateRoute(
  companyId: string,
  routeId: string,
  params: Partial<CreateRouteParams>
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  const origin = params.origin !== undefined || params.departureCity !== undefined
    ? capitalizeCityName(params.origin ?? params.departureCity ?? "") : undefined;
  const dest = params.destination !== undefined || params.arrivalCity !== undefined
    ? capitalizeCityName(params.destination ?? params.arrivalCity ?? "") : undefined;
  if (origin !== undefined) {
    data.origin = origin;
    data.departureCity = origin;
  }
  if (dest !== undefined) {
    data.destination = dest;
    data.arrivalCity = dest;
  }
  if (params.distanceKm !== undefined || params.distance !== undefined) {
    const v = params.distanceKm ?? params.distance ?? null;
    data.distanceKm = v;
    data.distance = v;
  }
  if (params.estimatedDurationMinutes !== undefined || params.estimatedDuration !== undefined) {
    const v = params.estimatedDurationMinutes ?? params.estimatedDuration ?? null;
    data.estimatedDurationMinutes = v;
    data.estimatedDuration = v;
  }
  await updateDoc(routeRef(companyId, routeId), data);
}

/** Delete a route and all its stops. */
export async function deleteRoute(companyId: string, routeId: string): Promise<void> {
  const stopsCol = collection(db, "companies", companyId, ROUTES_COLLECTION, routeId, ROUTE_STOPS_SUBCOLLECTION);
  const stopsSnap = await getDocs(stopsCol);
  for (const d of stopsSnap.docs) {
    await deleteDoc(d.ref);
  }
  await deleteDoc(routeRef(companyId, routeId));
}

/** Set route status (ACTIVE | DISABLED). */
export async function setRouteStatus(
  companyId: string,
  routeId: string,
  status: RouteStatus
): Promise<void> {
  await updateDoc(routeRef(companyId, routeId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

function normalizeRouteDoc(id: string, data: Record<string, unknown>): RouteDoc & { id: string } {
  const d = data as Record<string, unknown>;
  const origin = (d.origin ?? d.departureCity ?? "") as string;
  const destination = (d.destination ?? d.arrivalCity ?? "") as string;
  return {
    id,
    origin,
    destination,
    departureCity: origin,
    arrivalCity: destination,
    distanceKm: (d.distanceKm ?? d.distance) as number | null | undefined,
    estimatedDurationMinutes: (d.estimatedDurationMinutes ?? d.estimatedDuration) as number | null | undefined,
    distance: (d.distanceKm ?? d.distance) as number | null | undefined,
    estimatedDuration: (d.estimatedDurationMinutes ?? d.estimatedDuration) as number | null | undefined,
    status: d.status as RouteStatus | undefined,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  } as RouteDoc & { id: string };
}

/** List all routes for a company (CEO). Optionally filter by status. */
export async function listRoutes(
  companyId: string,
  options?: { limitCount?: number; activeOnly?: boolean }
): Promise<(RouteDoc & { id: string })[]> {
  const ref = routesRef(companyId);
  let q = query(ref, limit(options?.limitCount ?? 300));
  if (options?.activeOnly) {
    q = query(ref, where("status", "==", ROUTE_STATUS.ACTIVE), limit(options?.limitCount ?? 300));
  }
  const snap = await getDocs(q);
  let list = snap.docs.map((d) => normalizeRouteDoc(d.id, d.data() as Record<string, unknown>));
  list.sort((a, b) => {
    const c = (a.origin || a.departureCity || "").localeCompare(b.origin || b.departureCity || "");
    return c !== 0 ? c : (a.destination || a.arrivalCity || "").localeCompare(b.destination || b.arrivalCity || "");
  });
  return list;
}

/** List ACTIVE routes where departureCity equals the given city (for agency trip config). */
export async function listRoutesByDepartureCity(
  companyId: string,
  departureCity: string,
  options?: { limitCount?: number }
): Promise<(RouteDoc & { id: string })[]> {
  const cityNorm = (departureCity || "").trim();
  if (!cityNorm) return [];
  const q = query(
    routesRef(companyId),
    where("departureCity", "==", cityNorm),
    limit(options?.limitCount ?? 200)
  );
  const snap = await getDocs(q);
  let list = snap.docs.map((d) => normalizeRouteDoc(d.id, d.data() as Record<string, unknown>));
  list = list.filter((r) => (r.status ?? ROUTE_STATUS.ACTIVE) === ROUTE_STATUS.ACTIVE);
  list.sort((a, b) => (a.destination || a.arrivalCity || "").localeCompare(b.destination || b.arrivalCity || ""));
  return list;
}

/** Get a single route by id. */
export async function getRoute(
  companyId: string,
  routeId: string
): Promise<(RouteDoc & { id: string }) | null> {
  const snap = await getDoc(routeRef(companyId, routeId));
  if (!snap.exists()) return null;
  return normalizeRouteDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Alias for listRoutes. */
export const getRoutes = listRoutes;
