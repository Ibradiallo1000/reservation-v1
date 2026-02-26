// src/core/intelligence/anomalyEngine.ts
// Pure logic: detect financial and operational anomalies from injected data.
// No Firestore, no side effects.

import type { RiskSettingsDoc } from "./riskSettings";

export type AnomalySeverity = "low" | "medium" | "high";

export interface Anomaly {
  severity: AnomalySeverity;
  type: string;
  message: string;
  referenceId?: string;
}

export interface TripProfitInput {
  tripId: string;
  profit: number;
  margin: number;
  revenue: number;
}

export interface AgencyProfitInput {
  agencyId: string;
  profit: number;
}

export interface AgencyProfitHistoryEntry {
  agencyId: string;
  date: string;
  profit: number;
}

export interface DiscrepancyInput {
  agencyId: string;
  /** Absolute value of cash discrepancy (e.g. |computedDifference|). */
  amount: number;
}

export interface FleetVehicleInput {
  id: string;
  status: string;
  lastMovementAtMs: number | null;
}

export interface OccupancyInput {
  agencyId: string;
  totalPassengers: number;
  totalSeats: number;
}

/** Phase C3: vehicle financial history for cost/profit anomalies. */
export interface VehicleFinancialHistoryInput {
  vehicleId: string;
  totalFuelCost: number;
  totalMaintenanceCost: number;
  totalOperationalCost: number;
  totalRevenueGenerated: number;
  totalProfitGenerated: number;
}

/** Phase C3: 30-day cost comparison for explosion detection. */
export interface VehicleCost30DayInput {
  vehicleId: string;
  totalCostLast30d: number;
  totalCostPrev30d: number;
}

/** Phase C3: maintenance count per vehicle in last 30d. */
export interface MaintenanceCountInput {
  vehicleId: string;
  count: number;
}

/** Phase C3: trip with fuel cost for margin check. */
export interface TripProfitWithFuelInput {
  tripId: string;
  revenue: number;
  fuelCost: number;
  margin: number;
}

export interface AnomalyEngineInput {
  tripProfits: TripProfitInput[];
  agencyProfitsToday: AgencyProfitInput[];
  /** Optional: last 7 days of profit per agency for rolling average. If missing, rule is skipped. */
  agencyProfitHistory7d?: AgencyProfitHistoryEntry[];
  discrepancies: DiscrepancyInput[];
  fleetVehicles: FleetVehicleInput[];
  occupancyByAgency: OccupancyInput[];
  settings: RiskSettingsDoc;
  /** Current time in ms (for transit duration). */
  nowMs: number;
  /** Phase C3: optional. */
  vehicleFinancialHistories?: VehicleFinancialHistoryInput[];
  vehicleCosts30d?: VehicleCost30DayInput[];
  maintenanceCountByVehicle30d?: MaintenanceCountInput[];
  tripProfitsWithFuel?: TripProfitWithFuelInput[];
  /** Phase C3: from financialSettings; fuel expense above this triggers anomaly. */
  fuelExpenseAnomalyLimit?: number;
  /** Phase C3: recent fuel expenses (amount only) to check vs limit. */
  recentFuelExpenseAmounts?: number[];
}

/**
 * Detect all anomalies from injected data. Pure function.
 */
export function detectAnomalies(input: AnomalyEngineInput): Anomaly[] {
  const out: Anomaly[] = [];
  const {
    tripProfits,
    agencyProfitsToday,
    agencyProfitHistory7d,
    discrepancies,
    fleetVehicles,
    occupancyByAgency,
    settings,
    nowMs,
    vehicleFinancialHistories,
    vehicleCosts30d,
    maintenanceCountByVehicle30d,
    tripProfitsWithFuel,
    fuelExpenseAnomalyLimit,
    recentFuelExpenseAmounts,
  } = input;

  const minMargin = (settings.minimumMarginPercent ?? 10) / 100;
  const maxDiscrepancy = settings.maxCashDiscrepancy ?? 5000;
  const maxTransitMs = (settings.maxTransitHours ?? 12) * 60 * 60 * 1000;
  const minOccupancy = (settings.minimumOccupancyRate ?? 50) / 100;

  // 1) Trip with negative profit
  tripProfits.filter((t) => t.profit < 0).forEach((t) => {
    out.push({
      severity: "high",
      type: "trip_negative_profit",
      message: `Trajet ${t.tripId} en perte (profit: ${t.profit.toLocaleString("fr-FR")})`,
      referenceId: t.tripId,
    });
  });

  // 2) Trip with margin below threshold (only when revenue > 0)
  tripProfits
    .filter((t) => t.revenue > 0 && t.margin < minMargin)
    .forEach((t) => {
      out.push({
        severity: "medium",
        type: "trip_low_margin",
        message: `Trajet ${t.tripId} : marge ${(t.margin * 100).toFixed(1)}% < ${(minMargin * 100).toFixed(0)}%`,
        referenceId: t.tripId,
      });
    });

  // 3) Agency daily profit below rolling 7-day average (only if history provided)
  if (agencyProfitHistory7d && agencyProfitHistory7d.length > 0) {
    const avgByAgency = new Map<string, number>();
    const countByAgency = new Map<string, number>();
    agencyProfitHistory7d.forEach((e) => {
      const cur = avgByAgency.get(e.agencyId) ?? 0;
      const count = countByAgency.get(e.agencyId) ?? 0;
      avgByAgency.set(e.agencyId, cur + e.profit);
      countByAgency.set(e.agencyId, count + 1);
    });
    agencyProfitsToday.forEach((a) => {
      const avg = avgByAgency.get(a.agencyId);
      const count = countByAgency.get(a.agencyId) ?? 0;
      if (count > 0 && avg != null) {
        const rollingAvg = avg / count;
        if (a.profit < rollingAvg) {
          out.push({
            severity: "medium",
            type: "agency_below_rolling_avg",
            message: `Agence ${a.agencyId} : profit du jour (${a.profit.toLocaleString("fr-FR")}) sous la moyenne glissante (${rollingAvg.toLocaleString("fr-FR")})`,
            referenceId: a.agencyId,
          });
        }
      }
    });
  }

  // 4) Cash discrepancy above threshold
  discrepancies
    .filter((d) => d.amount > maxDiscrepancy)
    .forEach((d) => {
      out.push({
        severity: "high",
        type: "cash_discrepancy_high",
        message: `Écart de caisse agence ${d.agencyId} : ${d.amount.toLocaleString("fr-FR")} > seuil ${maxDiscrepancy.toLocaleString("fr-FR")}`,
        referenceId: d.agencyId,
      });
    });

  // 5) Vehicle in_transit longer than maxTransitHours
  fleetVehicles
    .filter((v) => v.status === "in_transit" && v.lastMovementAtMs != null)
    .forEach((v) => {
      const elapsed = nowMs - (v.lastMovementAtMs ?? 0);
      if (elapsed > maxTransitMs) {
        out.push({
          severity: "medium",
          type: "vehicle_transit_stale",
          message: `Véhicule ${v.id} en transit depuis plus de ${settings.maxTransitHours ?? 12}h`,
          referenceId: v.id,
        });
      }
    });

  // 6) Boarding occupancy below minimum (per agency/day)
  occupancyByAgency
    .filter((o) => o.totalSeats > 0)
    .forEach((o) => {
      const rate = o.totalPassengers / o.totalSeats;
      if (rate < minOccupancy) {
        out.push({
          severity: "low",
          type: "low_occupancy",
          message: `Agence ${o.agencyId} : taux de remplissage ${(rate * 100).toFixed(0)}% < ${(minOccupancy * 100).toFixed(0)}%`,
          referenceId: o.agencyId,
        });
      }
    });

  // Phase C3: 7) Vehicle cost explosion (> X% vs 30-day avg)
  const costExplosionPct = (settings.vehicleCostExplosionPercent ?? 50) / 100;
  if (vehicleCosts30d && vehicleCosts30d.length > 0) {
    vehicleCosts30d.forEach((v) => {
      const prev = v.totalCostPrev30d || 0;
      const curr = v.totalCostLast30d || 0;
      if (prev > 0 && curr > prev && (curr - prev) / prev > costExplosionPct) {
        out.push({
          severity: "medium",
          type: "vehicle_cost_explosion",
          message: `Véhicule ${v.vehicleId} : coûts +${(((curr - prev) / prev) * 100).toFixed(0)}% vs moyenne 30j précédente`,
          referenceId: v.vehicleId,
        });
      }
    });
  }

  // Phase C3: 8) Maintenance frequency spike
  const maintenanceSpikeThreshold = settings.maintenanceSpikeCountThreshold ?? 5;
  if (maintenanceCountByVehicle30d && maintenanceCountByVehicle30d.length > 0) {
    maintenanceCountByVehicle30d
      .filter((m) => m.count > maintenanceSpikeThreshold)
      .forEach((m) => {
        out.push({
          severity: "medium",
          type: "maintenance_frequency_spike",
          message: `Véhicule ${m.vehicleId} : ${m.count} maintenances sur 30j > seuil ${maintenanceSpikeThreshold}`,
          referenceId: m.vehicleId,
        });
      });
  }

  // Phase C3: 9) Trip fuel cost > margin threshold (fuel / revenue > threshold)
  const fuelMarginThreshold = settings.tripFuelCostMarginThreshold ?? 0.2;
  if (tripProfitsWithFuel && tripProfitsWithFuel.length > 0) {
    tripProfitsWithFuel
      .filter((t) => t.revenue > 0 && t.fuelCost / t.revenue > fuelMarginThreshold)
      .forEach((t) => {
        out.push({
          severity: "low",
          type: "trip_fuel_cost_above_margin",
          message: `Trajet ${t.tripId} : coût carburant ${((t.fuelCost / t.revenue) * 100).toFixed(0)}% du revenu > ${(fuelMarginThreshold * 100).toFixed(0)}%`,
          referenceId: t.tripId,
        });
      });
  }

  // Phase C3: 10) Negative vehicle lifetime profitability
  if (vehicleFinancialHistories && vehicleFinancialHistories.length > 0) {
    vehicleFinancialHistories
      .filter((v) => v.totalProfitGenerated < 0)
      .forEach((v) => {
        out.push({
          severity: "high",
          type: "vehicle_negative_lifetime_profit",
          message: `Véhicule ${v.vehicleId} : rentabilité globale négative (${v.totalProfitGenerated.toLocaleString("fr-FR")})`,
          referenceId: v.vehicleId,
        });
      });
  }

  // Phase C3: 11) Fuel expense above configurable limit
  if (fuelExpenseAnomalyLimit != null && fuelExpenseAnomalyLimit > 0 && recentFuelExpenseAmounts && recentFuelExpenseAmounts.length > 0) {
    recentFuelExpenseAmounts
      .filter((amt) => amt > fuelExpenseAnomalyLimit)
      .forEach((amt) => {
        out.push({
          severity: "medium",
          type: "fuel_expense_above_limit",
          message: `Dépense carburant ${amt.toLocaleString("fr-FR")} > seuil ${fuelExpenseAnomalyLimit.toLocaleString("fr-FR")}`,
        });
      });
  }

  return out;
}

/** Group anomalies by severity for display. */
export function groupAnomaliesBySeverity(anomalies: Anomaly[]): {
  high: Anomaly[];
  medium: Anomaly[];
  low: Anomaly[];
} {
  const high: Anomaly[] = [];
  const medium: Anomaly[] = [];
  const low: Anomaly[] = [];
  anomalies.forEach((a) => {
    if (a.severity === "high") high.push(a);
    else if (a.severity === "medium") medium.push(a);
    else low.push(a);
  });
  return { high, medium, low };
}
