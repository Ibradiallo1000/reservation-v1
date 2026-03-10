// Phase 1 — Véhicules au niveau compagnie. Phase 1H + Operational: technicalStatus, operationalStatus, statusHistory.
// Canonical fleet: single source of truth at companies/{companyId}/vehicles/{vehicleId}.
import type { Timestamp } from "firebase/firestore";
import type { TechnicalStatus, OperationalStatus } from "./vehicleTransitions";
import type { StatusHistoryEntry } from "./vehicleTransitions";

/** Legacy status (kept for backward compatibility). */
export const VEHICLE_STATUS = {
  GARAGE: "GARAGE",
  EN_SERVICE: "EN_SERVICE",
  EN_TRANSIT: "EN_TRANSIT",
  EN_MAINTENANCE: "EN_MAINTENANCE",
  ACCIDENTE: "ACCIDENTE",
  HORS_SERVICE: "HORS_SERVICE",
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS];

/** Canonical status for fleet operations and queries. Maps to legacy + technical/operational. */
export const CANONICAL_VEHICLE_STATUS = {
  AVAILABLE: "AVAILABLE",
  ON_TRIP: "ON_TRIP",
  MAINTENANCE: "MAINTENANCE",
  ACCIDENT: "ACCIDENT",
  OUT_OF_SERVICE: "OUT_OF_SERVICE",
} as const;

export type CanonicalVehicleStatus = (typeof CANONICAL_VEHICLE_STATUS)[keyof typeof CANONICAL_VEHICLE_STATUS];

export interface VehicleDoc {
  /** Numero bus interne (001 a 999). */
  busNumber?: string;
  /** Cle normalisee pour recherche/unicite du numero bus. */
  busNumberNormalized?: string;
  /** Legacy compatibility (ancien nom). */
  fleetNumber?: string;
  /** Legacy compatibility (ancien nom). */
  fleetNumberNormalized?: string;
  /** Code pays ISO (ex. "ML"). Obligatoire. */
  country: string;
  /** Plaque normalisée : majuscules, sans espaces ni tirets. Obligatoire. */
  plateNumber: string;
  model: string;
  year: number;
  /** Nombre de places (siège). Optionnel pour rétrocompat. */
  capacity?: number;
  /** Legacy: conservé pour rétrocompat. Déduit de technicalStatus/operationalStatus si absent. */
  status?: VehicleStatus;
  /** Canonical status for queries and UI. Preferred when present. */
  canonicalStatus?: CanonicalVehicleStatus;
  /** Phase 1 Operational: statut technique. */
  technicalStatus?: TechnicalStatus;
  /** Phase 1 Operational: statut opérationnel. */
  operationalStatus?: OperationalStatus;
  currentCity: string;
  /** Agency where vehicle is physically located (when agency-scoped). */
  currentAgencyId?: string | null;
  destinationCity?: string | null;
  /** User/personnel id of assigned driver. Optional; chauffeurName on affectation for legacy. */
  driverId?: string | null;
  /** Trip currently assigned (weeklyTrip id or instance). Cleared when trip finishes. */
  currentTripId?: string | null;
  /** Last completed trip id (set when trip finishes). */
  lastTripId?: string | null;
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
