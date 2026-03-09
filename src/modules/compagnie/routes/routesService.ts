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
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ROUTES_COLLECTION, ROUTE_STATUS, type RouteDoc, type RouteStatus } from "./routesTypes";

function routesRef(companyId: string) {
  return collection(db, "companies", companyId, ROUTES_COLLECTION);
}

function routeRef(companyId: string, routeId: string) {
  return doc(db, "companies", companyId, ROUTES_COLLECTION, routeId);
}

export interface CreateRouteParams {
  departureCity: string;
  arrivalCity: string;
  distance?: number | null;
  estimatedDuration?: number | null;
}

/** Create a route (status ACTIVE). Returns the new document id. */
export async function createRoute(
  companyId: string,
  params: CreateRouteParams
): Promise<string> {
  const ref = doc(routesRef(companyId));
  await setDoc(ref, {
    departureCity: (params.departureCity || "").trim(),
    arrivalCity: (params.arrivalCity || "").trim(),
    distance: params.distance ?? null,
    estimatedDuration: params.estimatedDuration ?? null,
    status: ROUTE_STATUS.ACTIVE,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Update a route (departureCity, arrivalCity, distance, estimatedDuration). */
export async function updateRoute(
  companyId: string,
  routeId: string,
  params: Partial<CreateRouteParams>
): Promise<void> {
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (params.departureCity !== undefined) data.departureCity = (params.departureCity || "").trim();
  if (params.arrivalCity !== undefined) data.arrivalCity = (params.arrivalCity || "").trim();
  if (params.distance !== undefined) data.distance = params.distance ?? null;
  if (params.estimatedDuration !== undefined) data.estimatedDuration = params.estimatedDuration ?? null;
  await updateDoc(routeRef(companyId, routeId), data);
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
  let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteDoc & { id: string }));
  list.sort((a, b) => {
    const c = (a.departureCity || "").localeCompare(b.departureCity || "");
    return c !== 0 ? c : (a.arrivalCity || "").localeCompare(b.arrivalCity || "");
  });
  return list;
}

/** List ACTIVE routes where departureCity equals the given city (for agency trip config). Routes without status are treated as ACTIVE for backward compatibility. */
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
  let list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteDoc & { id: string }));
  list = list.filter((r) => (r.status ?? ROUTE_STATUS.ACTIVE) === ROUTE_STATUS.ACTIVE);
  list.sort((a, b) => (a.arrivalCity || "").localeCompare(b.arrivalCity || ""));
  return list;
}

/** Get a single route by id. */
export async function getRoute(
  companyId: string,
  routeId: string
): Promise<(RouteDoc & { id: string }) | null> {
  const snap = await getDoc(routeRef(companyId, routeId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { id: snap.id, status: ROUTE_STATUS.ACTIVE, ...data } as RouteDoc & { id: string };
}
