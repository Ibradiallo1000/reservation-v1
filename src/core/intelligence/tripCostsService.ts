// src/core/intelligence/tripCostsService.ts
// CRUD for companies/{companyId}/tripCosts (no delete).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  TRIP_COSTS_COLLECTION,
  type TripCostDoc,
  type TripCostDocCreate,
  totalOperationalCost,
} from "./tripCosts";

function tripCostsRef(companyId: string) {
  return collection(db, "companies", companyId, TRIP_COSTS_COLLECTION);
}

function tripCostRef(companyId: string, tripCostId: string) {
  return doc(db, "companies", companyId, TRIP_COSTS_COLLECTION, tripCostId);
}

/** Create a new trip cost. Returns the new document id. */
export async function createTripCost(
  companyId: string,
  data: Omit<TripCostDocCreate, "createdAt" | "createdBy">,
  createdBy: string
): Promise<string> {
  const ref = doc(tripCostsRef(companyId));
  const now = Timestamp.now();
  await setDoc(ref, {
    tripId: data.tripId,
    agencyId: data.agencyId,
    date: data.date,
    ...(data.vehicleId != null && { vehicleId: data.vehicleId }),
    fuelCost: Number(data.fuelCost) || 0,
    driverCost: Number(data.driverCost) || 0,
    assistantCost: Number(data.assistantCost) || 0,
    tollCost: Number(data.tollCost) || 0,
    maintenanceCost: Number(data.maintenanceCost) || 0,
    otherOperationalCost: Number(data.otherOperationalCost) || 0,
    createdAt: now,
    createdBy,
  });
  return ref.id;
}

/** Update trip cost (only same-day edits allowed at UI level; rules may enforce). */
export async function updateTripCost(
  companyId: string,
  tripCostId: string,
  data: Partial<Omit<TripCostDoc, "tripId" | "agencyId" | "date" | "createdAt" | "createdBy">>
): Promise<void> {
  const ref = tripCostRef(companyId, tripCostId);
  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  if (data.fuelCost !== undefined) updates.fuelCost = Number(data.fuelCost) || 0;
  if (data.driverCost !== undefined) updates.driverCost = Number(data.driverCost) || 0;
  if (data.assistantCost !== undefined) updates.assistantCost = Number(data.assistantCost) || 0;
  if (data.tollCost !== undefined) updates.tollCost = Number(data.tollCost) || 0;
  if (data.maintenanceCost !== undefined) updates.maintenanceCost = Number(data.maintenanceCost) || 0;
  if (data.otherOperationalCost !== undefined) updates.otherOperationalCost = Number(data.otherOperationalCost) || 0;
  await updateDoc(ref, updates);
}

/** List trip costs for a company, optionally by date, agencyId and/or vehicleId. */
export async function listTripCosts(
  companyId: string,
  options?: { date?: string; agencyId?: string; vehicleId?: string; limitCount?: number }
): Promise<(TripCostDoc & { id: string })[]> {
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.date) constraints.push(where("date", "==", options.date));
  if (options?.agencyId) constraints.push(where("agencyId", "==", options.agencyId));
  if (options?.vehicleId) constraints.push(where("vehicleId", "==", options.vehicleId));
  const q = query(
    tripCostsRef(companyId),
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 200)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripCostDoc & { id: string }));
}

/** Get a single trip cost by id. */
export async function getTripCost(
  companyId: string,
  tripCostId: string
): Promise<(TripCostDoc & { id: string }) | null> {
  const ref = tripCostRef(companyId, tripCostId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as TripCostDoc & { id: string };
}

export { totalOperationalCost };
