import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { listFuelLogs } from "@/modules/compagnie/fuel/fuelLogsService";
import { listTripCosts } from "@/core/intelligence/tripCostsService";

type DateRange = { dateFrom?: string; dateTo?: string };

export interface VehicleCostBreakdown {
  vehicleId: string;
  fuelCost: number;
  maintenanceCost: number;
  tripOperationalCost: number;
  totalCost: number;
}

export interface TripProfitability {
  tripKey: string;
  routeKey: string;
  tripId: string;
  agencyId: string;
  date: string;
  vehicleId: string;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  totalCost: number;
  profit: number;
}

export interface RouteProfitability {
  routeKey: string;
  revenue: number;
  fuelCost: number;
  maintenanceCost: number;
  totalCost: number;
  profit: number;
  tripCount: number;
}

function inRange(dateStr: string, range?: DateRange): boolean {
  if (!dateStr) return false;
  const d = dateStr.slice(0, 10);
  if (range?.dateFrom && d < range.dateFrom.slice(0, 10)) return false;
  if (range?.dateTo && d > range.dateTo.slice(0, 10)) return false;
  return true;
}

function toDateOnly(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 10);
  const ts = value as { toDate?: () => Date; seconds?: number } | null;
  if (ts?.toDate) return ts.toDate().toISOString().slice(0, 10);
  if (typeof ts?.seconds === "number") return new Date(ts.seconds * 1000).toISOString().slice(0, 10);
  return "";
}

async function getMaintenanceExpensesByVehicle(
  companyId: string,
  range?: DateRange
): Promise<Map<string, number>> {
  const ref = collection(db, "companies", companyId, "expenses");
  const snap = await getDocs(query(ref, where("expenseCategory", "==", "maintenance"), limit(5000)));
  const totals = new Map<string, number>();
  snap.docs.forEach((d) => {
    const data = d.data() as {
      vehicleId?: string | null;
      amount?: number;
      expenseDate?: string | null;
      createdAt?: Timestamp;
    };
    const vehicleId = data.vehicleId ?? "";
    if (!vehicleId) return;
    const date = (data.expenseDate ?? "").slice(0, 10) || toDateOnly(data.createdAt);
    if (!inRange(date, range)) return;
    const amount = Number(data.amount ?? 0);
    totals.set(vehicleId, (totals.get(vehicleId) ?? 0) + amount);
  });
  return totals;
}

export async function getVehicleOperationalCosts(
  companyId: string,
  range?: DateRange
): Promise<VehicleCostBreakdown[]> {
  const [fuelLogs, tripCosts, maintenanceByVehicle] = await Promise.all([
    listFuelLogs(companyId, { limitCount: 5000 }),
    listTripCosts(companyId, { limitCount: 5000 }),
    getMaintenanceExpensesByVehicle(companyId, range),
  ]);

  const fuelByVehicle = new Map<string, number>();
  fuelLogs.forEach((log) => {
    const date = toDateOnly(log.date);
    if (!inRange(date, range)) return;
    const amount = Number(log.liters ?? 0) * Number(log.price ?? 0);
    fuelByVehicle.set(log.vehicleId, (fuelByVehicle.get(log.vehicleId) ?? 0) + amount);
  });

  const tripOperationalByVehicle = new Map<string, number>();
  tripCosts.forEach((t) => {
    const vehicleId = (t as any).vehicleId ?? "";
    if (!vehicleId) return;
    const date = String((t as any).date ?? "").slice(0, 10);
    if (!inRange(date, range)) return;
    const tripCost =
      Number((t as any).fuelCost ?? 0) +
      Number((t as any).driverCost ?? 0) +
      Number((t as any).assistantCost ?? 0) +
      Number((t as any).tollCost ?? 0) +
      Number((t as any).maintenanceCost ?? 0) +
      Number((t as any).otherOperationalCost ?? 0);
    tripOperationalByVehicle.set(
      vehicleId,
      (tripOperationalByVehicle.get(vehicleId) ?? 0) + tripCost
    );
  });

  const vehicleIds = new Set<string>([
    ...fuelByVehicle.keys(),
    ...maintenanceByVehicle.keys(),
    ...tripOperationalByVehicle.keys(),
  ]);

  return Array.from(vehicleIds).map((vehicleId) => {
    const fuelCost = fuelByVehicle.get(vehicleId) ?? 0;
    const maintenanceCost = maintenanceByVehicle.get(vehicleId) ?? 0;
    const tripOperationalCost = tripOperationalByVehicle.get(vehicleId) ?? 0;
    return {
      vehicleId,
      fuelCost,
      maintenanceCost,
      tripOperationalCost,
      totalCost: fuelCost + maintenanceCost + tripOperationalCost,
    };
  });
}

export async function getRouteProfitability(
  companyId: string,
  range?: DateRange
): Promise<{ routes: RouteProfitability[]; trips: TripProfitability[] }> {
  const [reservationSnap, tripCosts, fuelLogs, maintenanceByVehicle] = await Promise.all([
    getDocs(
      query(
        collectionGroup(db, "reservations"),
        where("companyId", "==", companyId),
        ...(range?.dateFrom ? [where("date", ">=", range.dateFrom.slice(0, 10))] : []),
        ...(range?.dateTo ? [where("date", "<=", range.dateTo.slice(0, 10))] : [])
      )
    ),
    listTripCosts(companyId, { limitCount: 5000 }),
    listFuelLogs(companyId, { limitCount: 5000 }),
    getMaintenanceExpensesByVehicle(companyId, range),
  ]);

  const revenueByTripKey = new Map<string, number>();
  const routeByTripKey = new Map<string, string>();

  reservationSnap.docs.forEach((d) => {
    const r = d.data() as any;
    const status = String(r.statut ?? "").toLowerCase();
    if (!["paye", "payé", "confirme", "confirmé"].includes(status)) return;
    const date = String(r.date ?? "").slice(0, 10);
    if (!inRange(date, range)) return;

    const tripId = String(r.trajetId ?? r.tripId ?? r.tripInstanceId ?? "");
    const agencyId = String(r.agencyId ?? "");
    const tripKey = `${agencyId}|${date}|${tripId}`;
    const amount = Number(r.montant ?? r.price ?? 0);
    revenueByTripKey.set(tripKey, (revenueByTripKey.get(tripKey) ?? 0) + amount);

    const departure = String(r.departure ?? r.depart ?? r.departureCity ?? "").trim();
    const arrival = String(r.arrival ?? r.arrivee ?? r.arrivalCity ?? "").trim();
    const routeKey = departure && arrival ? `${departure} -> ${arrival}` : tripId || "Route inconnue";
    routeByTripKey.set(tripKey, routeKey);
  });

  const trips: TripProfitability[] = [];
  const tripKeysByVehicleDay = new Map<string, string[]>();

  tripCosts.forEach((tc) => {
    const t: any = tc;
    const vehicleId = String(t.vehicleId ?? "");
    if (!vehicleId) return;
    const date = String(t.date ?? "").slice(0, 10);
    if (!inRange(date, range)) return;
    const agencyId = String(t.agencyId ?? "");
    const tripId = String(t.tripId ?? "");
    const tripKey = `${agencyId}|${date}|${tripId}`;
    const routeKey = routeByTripKey.get(tripKey) ?? tripId || "Route inconnue";

    const listKey = `${vehicleId}|${date}`;
    const existing = tripKeysByVehicleDay.get(listKey) ?? [];
    existing.push(tripKey);
    tripKeysByVehicleDay.set(listKey, existing);

    const tripOperationalCost =
      Number(t.fuelCost ?? 0) +
      Number(t.driverCost ?? 0) +
      Number(t.assistantCost ?? 0) +
      Number(t.tollCost ?? 0) +
      Number(t.maintenanceCost ?? 0) +
      Number(t.otherOperationalCost ?? 0);

    trips.push({
      tripKey,
      routeKey,
      tripId,
      agencyId,
      date,
      vehicleId,
      revenue: revenueByTripKey.get(tripKey) ?? 0,
      fuelCost: 0,
      maintenanceCost: 0,
      totalCost: tripOperationalCost,
      profit: 0,
    });
  });

  const tripByKey = new Map<string, TripProfitability>();
  trips.forEach((t) => tripByKey.set(t.tripKey, t));

  fuelLogs.forEach((log) => {
    const date = toDateOnly(log.date);
    if (!inRange(date, range)) return;
    const key = `${log.vehicleId}|${date}`;
    const targetTrips = tripKeysByVehicleDay.get(key) ?? [];
    if (targetTrips.length === 0) return;
    const distributed = (Number(log.liters ?? 0) * Number(log.price ?? 0)) / targetTrips.length;
    targetTrips.forEach((tripKey) => {
      const t = tripByKey.get(tripKey);
      if (!t) return;
      t.fuelCost += distributed;
    });
  });

  maintenanceByVehicle.forEach((maintenanceCost, vehicleId) => {
    const vehicleTrips = trips.filter((t) => t.vehicleId === vehicleId);
    if (vehicleTrips.length === 0) return;
    const distributed = maintenanceCost / vehicleTrips.length;
    vehicleTrips.forEach((t) => {
      t.maintenanceCost += distributed;
    });
  });

  trips.forEach((t) => {
    t.totalCost += t.fuelCost + t.maintenanceCost;
    t.profit = t.revenue - t.totalCost;
  });

  const routesMap = new Map<string, RouteProfitability>();
  trips.forEach((t) => {
    const current = routesMap.get(t.routeKey) ?? {
      routeKey: t.routeKey,
      revenue: 0,
      fuelCost: 0,
      maintenanceCost: 0,
      totalCost: 0,
      profit: 0,
      tripCount: 0,
    };
    current.revenue += t.revenue;
    current.fuelCost += t.fuelCost;
    current.maintenanceCost += t.maintenanceCost;
    current.totalCost += t.totalCost;
    current.profit += t.profit;
    current.tripCount += 1;
    routesMap.set(t.routeKey, current);
  });

  return {
    routes: Array.from(routesMap.values()).sort((a, b) => b.profit - a.profit),
    trips: trips.sort((a, b) => b.profit - a.profit),
  };
}

