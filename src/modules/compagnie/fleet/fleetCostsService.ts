/**
 * Fleet costs CRUD — companies/{companyId}/fleetCosts/{costId}
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  FLEET_COSTS_COLLECTION,
  type FleetCostDoc,
  type FleetCostType,
} from "./fleetCostsTypes";

function fleetCostsRef(companyId: string) {
  return collection(db, "companies", companyId, FLEET_COSTS_COLLECTION);
}

function fleetCostRef(companyId: string, costId: string) {
  return doc(db, "companies", companyId, FLEET_COSTS_COLLECTION, costId);
}

export interface CreateFleetCostParams {
  vehicleId: string;
  type: FleetCostType;
  amount: number;
  date: string;
  agencyId?: string | null;
  description?: string | null;
  createdBy?: string | null;
}

/** Create a fleet cost. Returns the new document id. */
export async function createFleetCost(
  companyId: string,
  params: CreateFleetCostParams
): Promise<string> {
  const ref = doc(fleetCostsRef(companyId));
  await setDoc(ref, {
    vehicleId: params.vehicleId,
    type: params.type,
    amount: Number(params.amount) || 0,
    date: (params.date || "").slice(0, 10),
    agencyId: params.agencyId ?? null,
    description: params.description ?? null,
    createdAt: Timestamp.now(),
    createdBy: params.createdBy ?? null,
  });
  return ref.id;
}

/** List fleet costs for a company, optionally by vehicle and/or date range. */
export async function listFleetCosts(
  companyId: string,
  options?: {
    vehicleId?: string;
    dateFrom?: string;
    dateTo?: string;
    limitCount?: number;
  }
): Promise<(FleetCostDoc & { id: string })[]> {
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.vehicleId) {
    constraints.push(where("vehicleId", "==", options.vehicleId));
  }
  if (options?.dateFrom) {
    constraints.push(where("date", ">=", options.dateFrom.slice(0, 10)));
  }
  if (options?.dateTo) {
    constraints.push(where("date", "<=", options.dateTo.slice(0, 10)));
  }
  const q = query(
    fleetCostsRef(companyId),
    ...constraints,
    orderBy("date", "desc"),
    limit(options?.limitCount ?? 500)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FleetCostDoc & { id: string }));
}

/** Get a single fleet cost by id. */
export async function getFleetCost(
  companyId: string,
  costId: string
): Promise<(FleetCostDoc & { id: string }) | null> {
  const snap = await getDoc(fleetCostRef(companyId, costId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as FleetCostDoc & { id: string };
}
