/**
 * Route schedules CRUD.
 * Path: companies/{companyId}/routeSchedules/{scheduleId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  ROUTE_SCHEDULES_COLLECTION,
  type RouteScheduleDoc,
  type ScheduleStatus,
} from "./routeSchedulesTypes";

function routeSchedulesRef(companyId: string) {
  return collection(db, "companies", companyId, ROUTE_SCHEDULES_COLLECTION);
}

function routeScheduleRef(companyId: string, scheduleId: string) {
  return doc(db, "companies", companyId, ROUTE_SCHEDULES_COLLECTION, scheduleId);
}

export interface CreateRouteScheduleParams {
  routeId: string;
  agencyId: string;
  busId?: string | null;
  departureTime: string;
  daysOfWeek: string[];
  status?: ScheduleStatus;
}

/** Create a route schedule. Returns the new document id. */
export async function createRouteSchedule(
  companyId: string,
  params: CreateRouteScheduleParams
): Promise<string> {
  const ref = doc(routeSchedulesRef(companyId));
  await setDoc(ref, {
    routeId: params.routeId,
    agencyId: params.agencyId,
    busId: params.busId ?? null,
    departureTime: (params.departureTime || "").trim(),
    daysOfWeek: Array.isArray(params.daysOfWeek) ? params.daysOfWeek : [],
    status: params.status ?? "active",
  });
  return ref.id;
}

/** List schedules for an agency. */
export async function listRouteSchedulesByAgency(
  companyId: string,
  agencyId: string,
  options?: { limitCount?: number }
): Promise<(RouteScheduleDoc & { id: string })[]> {
  const q = query(
    routeSchedulesRef(companyId),
    where("agencyId", "==", agencyId),
    limit(options?.limitCount ?? 200)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteScheduleDoc & { id: string }));
  list.sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
  return list;
}

/** List schedules for a route. */
export async function listRouteSchedulesByRoute(
  companyId: string,
  routeId: string,
  options?: { limitCount?: number }
): Promise<(RouteScheduleDoc & { id: string })[]> {
  const q = query(
    routeSchedulesRef(companyId),
    where("routeId", "==", routeId),
    limit(options?.limitCount ?? 200)
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RouteScheduleDoc & { id: string }));
  list.sort((a, b) => (a.departureTime || "").localeCompare(b.departureTime || ""));
  return list;
}

/** Get a single schedule by id. */
export async function getRouteSchedule(
  companyId: string,
  scheduleId: string
): Promise<(RouteScheduleDoc & { id: string }) | null> {
  const snap = await getDoc(routeScheduleRef(companyId, scheduleId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as RouteScheduleDoc & { id: string };
}
