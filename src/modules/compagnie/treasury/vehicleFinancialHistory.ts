// Phase C3 — Vehicle financial history. Client-side aggregation; one doc per vehicle.
import { doc, getDoc, setDoc, getDocs, collection, serverTimestamp, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export const VEHICLE_FINANCIAL_HISTORY_COLLECTION = "vehicleFinancialHistory";

export interface VehicleFinancialHistoryDoc {
  vehicleId: string;
  totalFuelCost: number;
  totalMaintenanceCost: number;
  totalOperationalCost: number;
  totalRevenueGenerated: number;
  totalProfitGenerated: number;
  updatedAt: Timestamp;
}

function collectionRef(companyId: string) {
  return collection(db, "companies", companyId, VEHICLE_FINANCIAL_HISTORY_COLLECTION);
}

function docRef(companyId: string, vehicleId: string) {
  return doc(db, "companies", companyId, VEHICLE_FINANCIAL_HISTORY_COLLECTION, vehicleId);
}

/** Get history for one vehicle. */
export async function getVehicleFinancialHistory(
  companyId: string,
  vehicleId: string
): Promise<VehicleFinancialHistoryDoc | null> {
  const snap = await getDoc(docRef(companyId, vehicleId));
  if (!snap.exists()) return null;
  return snap.data() as VehicleFinancialHistoryDoc;
}

/** List all vehicle financial histories for the company. */
export async function listVehicleFinancialHistories(
  companyId: string,
  options?: { limitCount?: number }
): Promise<(VehicleFinancialHistoryDoc & { id: string })[]> {
  const ref = collectionRef(companyId);
  const snap = await getDocs(ref);
  const limit = options?.limitCount ?? 500;
  return snap.docs.slice(0, limit).map((d) => ({ id: d.id, ...d.data() } as VehicleFinancialHistoryDoc & { id: string }));
}

/** Upsert vehicle financial history (client-side aggregation). Idempotent. */
export async function setVehicleFinancialHistory(
  companyId: string,
  vehicleId: string,
  data: {
    totalFuelCost: number;
    totalMaintenanceCost: number;
    totalOperationalCost: number;
    totalRevenueGenerated: number;
    totalProfitGenerated: number;
  }
): Promise<void> {
  const ref = docRef(companyId, vehicleId);
  await setDoc(
    ref,
    {
      vehicleId,
      totalFuelCost: Number(data.totalFuelCost) || 0,
      totalMaintenanceCost: Number(data.totalMaintenanceCost) || 0,
      totalOperationalCost: Number(data.totalOperationalCost) || 0,
      totalRevenueGenerated: Number(data.totalRevenueGenerated) || 0,
      totalProfitGenerated: Number(data.totalProfitGenerated) || 0,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Aggregate expenses (with vehicleId and expenseCategory) into per-vehicle cost totals.
 * Call from client after loading paid/approved expenses; then call setVehicleFinancialHistory per vehicle.
 */
export function aggregateExpensesByVehicle(
  expenses: { vehicleId?: string | null; expenseCategory?: string | null; amount?: number; status?: string }[]
): Map<string, { fuel: number; maintenance: number; operational: number }> {
  const map = new Map<string, { fuel: number; maintenance: number; operational: number }>();
  const paidOrApproved = (e: { status?: string }) => e.status === "paid" || e.status === "approved";
  for (const e of expenses.filter(paidOrApproved)) {
    const vid = e.vehicleId ?? "";
    if (!vid) continue;
    let entry = map.get(vid);
    if (!entry) entry = { fuel: 0, maintenance: 0, operational: 0 };
    const amt = Number(e.amount) || 0;
    const cat = String(e.expenseCategory ?? (e as { category?: string }).category ?? "");
    if (cat === "fuel") entry.fuel += amt;
    else if (cat === "maintenance") entry.maintenance += amt;
    else if (cat === "operational" || cat === "toll" || cat === "other") entry.operational += amt;
    map.set(vid, entry);
  }
  return map;
}
