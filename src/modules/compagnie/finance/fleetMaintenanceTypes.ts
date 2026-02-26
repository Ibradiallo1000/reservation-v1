// Phase C — Fleet maintenance (Enterprise). companies/{companyId}/fleetMaintenance/{maintenanceId}
import type { Timestamp } from "firebase/firestore";

export const MAINTENANCE_COST_TYPES = ["cash", "credit"] as const;
export type MaintenanceCostType = (typeof MAINTENANCE_COST_TYPES)[number];

export interface FleetMaintenanceDoc {
  vehicleId: string;
  agencyId: string;
  description: string;
  costType: MaintenanceCostType;
  linkedExpenseId?: string | null;
  linkedPayableId?: string | null;
  createdBy: string;
  createdAt: Timestamp;
}

export interface FleetMaintenanceDocCreate {
  vehicleId: string;
  agencyId: string;
  description: string;
  costType: MaintenanceCostType;
  linkedExpenseId?: string | null;
  linkedPayableId?: string | null;
  createdBy: string;
}

export const FLEET_MAINTENANCE_COLLECTION = "fleetMaintenance";
