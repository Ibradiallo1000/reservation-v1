/**
 * Fleet finance aggregation: vehicleRevenue, vehicleCosts, vehicleProfit per vehicle.
 * - vehicleCosts = sum(fleetCosts for vehicle) + sum(tripCosts with vehicleId for vehicle)
 * - vehicleRevenue = sum of reservations linked to trips that have vehicleId in tripCosts
 * - vehicleProfit = vehicleRevenue - vehicleCosts
 */

import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { listVehicles } from "./vehiclesService";
import { listFleetCosts } from "./fleetCostsService";
import { listTripCosts } from "@/core/intelligence/tripCostsService";
import { totalOperationalCost } from "@/core/intelligence/tripCosts";
import type { TripCostDoc } from "@/core/intelligence/tripCosts";

export interface VehicleFinancialStats {
  vehicleId: string;
  plateNumber: string;
  model: string;
  vehicleRevenue: number;
  vehicleCosts: number;
  vehicleProfit: number;
}

/** Default date range for revenue aggregation: last 12 months. */
function defaultDateRange(): { dateFrom: string; dateTo: string } {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10),
  };
}

/**
 * Build a map (agencyId, date, trajetId) -> total revenue (sum of montant for paye/confirme).
 */
async function getTripRevenueMap(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("date", ">=", dateFrom),
    where("date", "<=", dateTo)
  );
  const snap = await getDocs(q);
  snap.docs.forEach((d) => {
    const data = d.data() as { agencyId?: string; date?: string; trajetId?: string; montant?: number; statut?: string };
    const statut = (data.statut ?? "").toString().toLowerCase();
    if (statut !== "paye" && statut !== "confirme") return;
    const key = `${data.agencyId ?? ""}|${(data.date ?? "").slice(0, 10)}|${data.trajetId ?? ""}`;
    const amount = Number(data.montant) || 0;
    map.set(key, (map.get(key) ?? 0) + amount);
  });
  return map;
}

/**
 * Get per-vehicle financial stats: revenue, costs, profit.
 * Uses fleetCosts + tripCosts (with vehicleId) for costs; reservations linked via tripCosts for revenue.
 */
export async function getVehicleFinancialStats(
  companyId: string,
  options?: { dateFrom?: string; dateTo?: string }
): Promise<VehicleFinancialStats[]> {
  const { dateFrom, dateTo } = { ...defaultDateRange(), ...(options ?? {}) };
  const [vehicles, fleetCostsList, tripCostsList, tripRevenueMap] = await Promise.all([
    listVehicles(companyId, 500),
    listFleetCosts(companyId, { dateFrom, dateTo, limitCount: 5000 }),
    listTripCosts(companyId, { limitCount: 3000 }),
    getTripRevenueMap(companyId, dateFrom, dateTo),
  ]);

  const costsByVehicle = new Map<string, number>();
  const revenueByVehicle = new Map<string, number>();

  for (const c of fleetCostsList) {
    const v = c.vehicleId || "";
    if (!v) continue;
    costsByVehicle.set(v, (costsByVehicle.get(v) ?? 0) + (Number(c.amount) || 0));
  }

  for (const t of tripCostsList) {
    const doc = t as TripCostDoc & { id: string };
    const vehicleId = doc.vehicleId ?? "";
    const operational = totalOperationalCost(doc);
    if (vehicleId) {
      costsByVehicle.set(vehicleId, (costsByVehicle.get(vehicleId) ?? 0) + operational);
      const key = `${doc.agencyId ?? ""}|${(doc.date ?? "").slice(0, 10)}|${doc.tripId ?? ""}`;
      const rev = tripRevenueMap.get(key) ?? 0;
      revenueByVehicle.set(vehicleId, (revenueByVehicle.get(vehicleId) ?? 0) + rev);
    }
  }

  return vehicles.map((v) => {
    const vid = v.id;
    const revenue = revenueByVehicle.get(vid) ?? 0;
    const costs = costsByVehicle.get(vid) ?? 0;
    const profit = revenue - costs;
    return {
      vehicleId: vid,
      plateNumber: (v as { plateNumber?: string }).plateNumber ?? "",
      model: (v as { model?: string }).model ?? "",
      vehicleRevenue: revenue,
      vehicleCosts: costs,
      vehicleProfit: profit,
    };
  });
}
