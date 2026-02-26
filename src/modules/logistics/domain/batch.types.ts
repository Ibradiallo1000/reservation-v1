/**
 * Teliya Logistics Engine — Domain: Batch types.
 * Backend only. No UI. Isolated from reservations and fleet.
 */

export type BatchStatus =
  | "OPEN"
  | "DEPARTED"
  | "ARRIVED"
  | "CLOSED";

export interface Batch {
  batchId: string;
  departureAgencyId: string;
  arrivalAgencyId: string;
  vehicleId: string;
  tripId?: string;
  departureDate: string;
  departureHeure: string;
  shipmentIds: string[];
  status: BatchStatus;
  createdAt: unknown;
  createdBy: string;
}
