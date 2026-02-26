// src/modules/agence/fleet/types.ts
// Phase 3: Fleet vehicle and assignment types.
// State machine: garage | assigned | in_transit | arrived | maintenance
import type { Timestamp, FieldValue } from "firebase/firestore";

export type FleetVehicleStatus =
  | "garage"
  | "assigned"
  | "in_transit"
  | "arrived"
  | "maintenance";

/**
 * Allowed status transitions (state machine).
 * - assigned → in_transit (on boarding closure)
 * - in_transit → arrived (when confirmed at destination agency)
 * - arrived → garage (optional reset)
 * - garage → assigned (on assignment)
 * - garage → maintenance | maintenance → garage (no movement)
 */
export const FLEET_STATUS_TRANSITIONS: Record<FleetVehicleStatus, readonly FleetVehicleStatus[]> = {
  garage: ["assigned", "maintenance"],
  assigned: ["in_transit"],
  in_transit: ["arrived"],
  arrived: ["garage"],
  maintenance: ["garage"],
} as const;

export function canTransition(from: FleetVehicleStatus, to: FleetVehicleStatus): boolean {
  return (FLEET_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

export interface FleetVehicleDoc {
  plateNumber: string;
  internalCode: string;
  capacity: number;
  status: FleetVehicleStatus;
  currentAgencyId: string | null;
  /** Destination agency when in_transit (arrival agency) */
  destinationAgencyId: string | null;
  currentTripId: string | null;
  currentDeparture: string | null;
  currentArrival: string | null;
  currentDate: string | null;
  currentHeure: string | null;
  /** ISO date-time or Firestore Timestamp for departure slot */
  departureTime: Timestamp | string | null;
  /** ISO date-time or Firestore Timestamp for ETA */
  estimatedArrivalTime: Timestamp | string | null;
  /** When writing, can be serverTimestamp() (FieldValue). */
  lastMovementAt: Timestamp | FieldValue | null;
  lastMovementBy: string | null;
  chauffeurName: string;
  convoyeurName: string;
  /** When writing, can be serverTimestamp() (FieldValue). */
  createdAt: Timestamp | FieldValue;
  /** When writing, can be serverTimestamp() (FieldValue). */
  updatedAt: Timestamp | FieldValue;
  migratedFromAffectation?: boolean;
}

export interface FleetVehicle extends FleetVehicleDoc {
  id: string;
}

/** fleetMovements collection: companies/{companyId}/fleetMovements/{movementId} */
export interface FleetMovementDoc {
  vehicleId: string;
  fromAgencyId: string | null;
  toAgencyId: string | null;
  tripId: string | null;
  date: string | null;
  heure: string | null;
  movedBy: string;
  movedAt: Timestamp;
  previousStatus: FleetVehicleStatus;
  newStatus: FleetVehicleStatus;
}

export interface FleetMovement extends FleetMovementDoc {
  id: string;
}

export function affectationKey(dep: string, arr: string, heure: string, date: string): string {
  return `${dep.trim()}_${arr.trim()}_${heure.trim()}_${date}`.replace(/\s+/g, "-");
}
