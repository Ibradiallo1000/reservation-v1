// Phase 1 — Véhicules au niveau compagnie. Phase 1H + Operational: technicalStatus, operationalStatus, statusHistory.
import type { Timestamp } from "firebase/firestore";
import type { TechnicalStatus, OperationalStatus } from "./vehicleTransitions";
import type { StatusHistoryEntry } from "./vehicleTransitions";

export const VEHICLE_STATUS = {
  GARAGE: "GARAGE",
  EN_SERVICE: "EN_SERVICE",
  EN_TRANSIT: "EN_TRANSIT",
  EN_MAINTENANCE: "EN_MAINTENANCE",
  ACCIDENTE: "ACCIDENTE",
  HORS_SERVICE: "HORS_SERVICE",
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS];

export interface VehicleDoc {
  /** Code pays ISO (ex. "ML"). Obligatoire. */
  country: string;
  /** Plaque normalisée : majuscules, sans espaces ni tirets. Obligatoire. */
  plateNumber: string;
  model: string;
  year: number;
  /** Legacy: conservé pour rétrocompat. Déduit de technicalStatus/operationalStatus si absent. */
  status?: VehicleStatus;
  /** Phase 1 Operational: statut technique. */
  technicalStatus?: TechnicalStatus;
  /** Phase 1 Operational: statut opérationnel. */
  operationalStatus?: OperationalStatus;
  currentCity: string;
  destinationCity?: string | null;
  /** Phase 1 Operational: historique des changements de statut. */
  statusHistory?: StatusHistoryEntry[];
  /** Phase 1 Soft Delete: archivage (pas de suppression physique). */
  isArchived?: boolean;
  archivedAt?: Timestamp;
  archivedBy?: string;
  /** Phase 1F — optionnel */
  insuranceExpiryDate?: Timestamp;
  inspectionExpiryDate?: Timestamp;
  vignetteExpiryDate?: Timestamp;
  purchaseDate?: Timestamp;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const VEHICLES_COLLECTION = "vehicles";

export type { TechnicalStatus, OperationalStatus, StatusHistoryEntry };
