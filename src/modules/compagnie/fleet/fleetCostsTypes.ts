/**
 * Fleet costs — Firestore: companies/{companyId}/fleetCosts/{costId}
 * Tracks all vehicle-level costs (fuel, maintenance, repair, insurance, salary).
 */

import type { Timestamp } from "firebase/firestore";

export const FLEET_COSTS_COLLECTION = "fleetCosts";

export type FleetCostType =
  | "fuel"
  | "maintenance"
  | "repair"
  | "insurance"
  | "salary";

export interface FleetCostDoc {
  vehicleId: string;
  type: FleetCostType;
  amount: number;
  date: string; // YYYY-MM-DD
  agencyId: string | null;
  description: string | null;
  createdAt?: Timestamp;
  createdBy?: string | null;
}

export type FleetCostDocWithId = FleetCostDoc & { id: string };
