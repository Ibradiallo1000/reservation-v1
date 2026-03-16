/**
 * Quota souple par escale pour les tripInstances.
 * Sous-collection: companies/{companyId}/tripInstances/{tripInstanceId}/inventory/quota
 */

export interface TripInstanceInventoryDoc {
  /** Priorité agence origine (0–1). Ex. 0.7 = origine peut vendre 70 % en priorité. */
  originPriority: number;
  /** Part de la capacité réservée par escale (0–1). Ex. 0.2 = 20 % = 12 places sur 60. */
  stopSoftQuotaPercent: number;
  /** Heures avant arrivée prévue à l'escale à partir desquelles le quota est libéré. */
  quotaReleaseHoursBeforeArrival: number;
  updatedAt?: unknown;
}

export const DEFAULT_INVENTORY: TripInstanceInventoryDoc = {
  originPriority: 0.7,
  stopSoftQuotaPercent: 0.2,
  quotaReleaseHoursBeforeArrival: 4,
};
