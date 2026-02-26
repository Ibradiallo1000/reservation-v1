/**
 * Teliya Logistics Engine — State machine: strict shipment status transitions.
 * No loose transitions allowed. Used by services to validate before persisting.
 */

import type { ShipmentStatus } from "./shipment.types";

/** Allowed transitions: from -> to[] */
/** Phase 1: CREATED -> ARRIVED allowed for manual simulation when no batch/vehicle yet */
const TRANSITIONS: Record<ShipmentStatus, readonly ShipmentStatus[]> = {
  CREATED: ["STORED", "CANCELLED", "ARRIVED"],
  STORED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_TRANSIT"],
  IN_TRANSIT: ["ARRIVED", "LOST"],
  ARRIVED: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP: ["DELIVERED", "RETURNED"],
  DELIVERED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
  LOST: ["CLAIM_PENDING"],
  CLAIM_PENDING: ["CLAIM_PAID"],
  CLAIM_PAID: [],
  RETURNED: [],
};

/**
 * Returns true only if the transition from `from` to `to` is allowed.
 * No loose transitions allowed.
 */
export function canShipmentTransition(from: ShipmentStatus, to: ShipmentStatus): boolean {
  const allowed = TRANSITIONS[from];
  if (!allowed) return false;
  return (allowed as readonly string[]).includes(to);
}
