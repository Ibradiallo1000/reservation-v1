/**
 * Fleet compatibility layer: map fleetVehicles ↔ vehicles (canonical).
 *
 * Canonical model: companies/{companyId}/vehicles/{vehicleId}
 * Deprecated: companies/{companyId}/fleetVehicles/{vehicleId}
 *
 * This module allows gradual migration:
 * - Reads: prefer vehicles; fallback or merge from fleetVehicles when needed.
 * - Writes: update vehicles (canonical); optionally sync to fleetVehicles until migration complete.
 *
 * Mapping (fleetVehicles → vehicles):
 * - currentAgencyId → currentAgencyId
 * - currentTripId → currentTripId
 * - chauffeurName → driverId (temporary: store as string until driverId is user id)
 * - status garage → AVAILABLE, assigned/in_transit → ON_TRIP, maintenance → MAINTENANCE
 *
 * DO NOT remove fleetVehicles reads until all consumers use vehicles.
 */

import type { VehicleDoc } from "./vehicleTypes";
import type { CanonicalVehicleStatus } from "./vehicleTypes";
import { CANONICAL_VEHICLE_STATUS } from "./vehicleTypes";

export type FleetVehicleLegacyDoc = {
  id?: string;
  plateNumber?: string;
  internalCode?: string;
  capacity?: number;
  status?: string;
  currentAgencyId?: string | null;
  destinationAgencyId?: string | null;
  currentTripId?: string | null;
  chauffeurName?: string;
  convoyeurName?: string;
  currentDeparture?: string | null;
  currentArrival?: string | null;
  currentDate?: string | null;
  currentHeure?: string | null;
  [key: string]: unknown;
};

/**
 * Map legacy fleetVehicles status to canonical status.
 */
export function fleetStatusToCanonical(legacy: string | undefined): CanonicalVehicleStatus {
  switch (legacy) {
    case "garage":
    case "arrived":
      return CANONICAL_VEHICLE_STATUS.AVAILABLE;
    case "assigned":
    case "in_transit":
      return CANONICAL_VEHICLE_STATUS.ON_TRIP;
    case "maintenance":
      return CANONICAL_VEHICLE_STATUS.MAINTENANCE;
    default:
      return CANONICAL_VEHICLE_STATUS.AVAILABLE;
  }
}

/**
 * Build a partial VehicleDoc from a fleetVehicles document (for merge/fallback).
 * driverId: temporary use of chauffeurName as string; replace with user id when available.
 */
export function fleetVehicleToVehiclePartial(
  fleet: FleetVehicleLegacyDoc,
  options?: { currentCity?: string; destinationCity?: string }
): Partial<VehicleDoc> {
  const canonicalStatus = fleetStatusToCanonical(fleet.status);
  return {
    plateNumber: fleet.plateNumber ?? "",
    model: fleet.internalCode ?? fleet.plateNumber ?? "",
    capacity: fleet.capacity ?? undefined,
    currentAgencyId: fleet.currentAgencyId ?? null,
    currentTripId: fleet.currentTripId ?? null,
    driverId: (fleet.chauffeurName as string) ?? null,
    canonicalStatus,
    currentCity: options?.currentCity ?? "",
    destinationCity: options?.destinationCity ?? null,
  };
}

/**
 * @deprecated Use companies/{companyId}/vehicles. fleetVehicles is kept for backward compatibility only.
 */
export const FLEET_VEHICLES_DEPRECATED =
  "companies/{companyId}/fleetVehicles is deprecated. Use companies/{companyId}/vehicles.";
