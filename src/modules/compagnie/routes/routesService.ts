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
  /** Origin / start city (or use startCity, departureCity for compat). */
  origin?: string;
  /** Destination / end city (or use endCity, arrivalCity for compat). */
  destination?: string;
  startCity?: string;
  endCity?: string;
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
  return capitalizeCityName(params.origin ?? params.startCity ?? params.departureCity ?? "");
}
function normDest(params: CreateRouteParams): string {
  return capitalizeCityName(params.destination ?? params.endCity ?? params.arrivalCity ?? "");
}

/** Create a route (status ACTIVE). One route = both directions (startCity ↔ endCity). Rejects if a route already exists between the same two cities (either order). */
export async function createRoute(
  companyId: string,
  params: CreateRouteParams
): Promise<string> {
  const origin = normOrigin(params);
  const dest = normDest(params);
  if (!origin || !dest) throw new Error("Origin et destination sont obligatoires.");
  if (origin.toLowerCase() === dest.toLowerCase()) throw new Error("L'origine et la destination doivent être différentes.");
  const existing = await listRoutes(companyId, { limitCount: 500 });
  const hasDuplicate = existing.some(
    (r) => {
      const a = (r.startCity ?? r.origin ?? "").toLowerCase();
      const b = (r.endCity ?? r.destination ?? "").toLowerCase();
      return (a === origin.toLowerCase() && b === dest.toLowerCase()) || (a === dest.toLowerCase() && b === origin.toLowerCase());
    }
  );
  if (hasDuplicate) throw new Error("Une route existe déjà entre ces deux villes. Une seule route représente les deux sens (aller et retour).");
  const ref = doc(routesRef(companyId));
  await setDoc(ref, {
    startCity: origin,
    endCity: dest,
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
    data.startCity = origin;
  }
  if (dest !== undefined) {
    data.destination = dest;
    data.arrivalCity = dest;
    data.endCity = dest;
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
  const origin = (d.origin ?? d.departureCity ?? d.startCity ?? "") as string;
  const destination = (d.destination ?? d.arrivalCity ?? d.endCity ?? "") as string;
  const startCity = (d.startCity ?? origin) as string;
  const endCity = (d.endCity ?? destination) as string;
  return {
    id,
    startCity,
    endCity,
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

/** List ACTIVE routes where departureCity equals the given city (for agency trip config).
 *  Normalizes the city with capitalizeCityName so agency city (e.g. "bamako") matches route departureCity ("Bamako"). */
export async function listRoutesByDepartureCity(
  companyId: string,
  departureCity: string,
  options?: { limitCount?: number }
): Promise<(RouteDoc & { id: string })[]> {
  const cityNorm = capitalizeCityName((departureCity || "").trim());
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

/** List ACTIVE routes where startCity or endCity (or origin/destination for legacy routes) equals the given city (for agency trip config: one route = both directions). */
export async function listRoutesByStartOrEndCity(
  companyId: string,
  city: string,
  options?: { limitCount?: number }
): Promise<(RouteDoc & { id: string })[]> {
  const cityNorm = capitalizeCityName((city || "").trim());
  if (!cityNorm) return [];
  const limitCount = options?.limitCount ?? 200;
  const ref = routesRef(companyId);
  // Query all fields that can represent "city at one end": new (startCity/endCity) and legacy (origin/destination, departureCity/arrivalCity)
  const [snapStartCity, snapEndCity, snapOrigin, snapDestination] = await Promise.all([
    getDocs(query(ref, where("startCity", "==", cityNorm), limit(limitCount))),
    getDocs(query(ref, where("endCity", "==", cityNorm), limit(limitCount))),
    getDocs(query(ref, where("origin", "==", cityNorm), limit(limitCount))),
    getDocs(query(ref, where("destination", "==", cityNorm), limit(limitCount))),
  ]);
  const byId = new Map<string, ReturnType<typeof normalizeRouteDoc>>();
  const addFromSnap = (snap: Awaited<ReturnType<typeof getDocs>>) => {
    for (const d of snap.docs) {
      if (byId.has(d.id)) continue;
      const r = normalizeRouteDoc(d.id, d.data() as Record<string, unknown>);
      if ((r.status ?? ROUTE_STATUS.ACTIVE) === ROUTE_STATUS.ACTIVE) byId.set(r.id, r);
    }
  };
  addFromSnap(snapStartCity);
  addFromSnap(snapEndCity);
  addFromSnap(snapOrigin);
  addFromSnap(snapDestination);
  const list = Array.from(byId.values());
  list.sort((a, b) => {
    const sa = a.startCity ?? a.origin ?? "";
    const sb = b.startCity ?? b.origin ?? "";
    return sa.localeCompare(sb) || (a.endCity ?? a.destination ?? "").localeCompare(b.endCity ?? b.destination ?? "");
  });
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
