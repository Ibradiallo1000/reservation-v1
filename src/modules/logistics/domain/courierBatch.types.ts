/**
 * Teliya Logistics — Phase 3: Courier batch (lot) types.
 * Agency-scoped: companies/{companyId}/agences/{agencyId}/batches
 * No change to transport engine or reservations.
 */

export type CourierBatchStatus = "DRAFT" | "READY" | "DEPARTED" | "CLOSED";

export interface CourierBatch {
  batchId: string;
  originAgencyId: string;
  /** Same key as affectations: dep_arr_heure_date */
  tripKey: string;
  vehicleId: string;
  shipmentIds: string[];
  status: CourierBatchStatus;
  createdBy: string;
  createdAt: unknown;
  departedAt?: unknown;
  closedAt?: unknown;
}
