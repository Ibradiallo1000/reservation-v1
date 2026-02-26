// Phase 1 — Affectation (agence) : document lié au véhicule compagnie.
import type { Timestamp } from "firebase/firestore";

export const AFFECTATION_STATUS = {
  AFFECTE: "AFFECTE",
  DEPART_CONFIRME: "DEPART_CONFIRME",
  ARRIVE: "ARRIVE",
  CANCELLED: "CANCELLED",
} as const;

export type AffectationStatus = (typeof AFFECTATION_STATUS)[keyof typeof AFFECTATION_STATUS];

export interface AffectationDoc {
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  tripId: string;
  departureCity: string;
  arrivalCity: string;
  departureTime: string;
  driverName?: string;
  driverPhone?: string;
  convoyeurName?: string;
  convoyeurPhone?: string;
  status: AffectationStatus;
  assignedBy: string;
  assignedAt: Timestamp;
  departureConfirmedAt?: Timestamp | null;
  arrivalConfirmedAt?: Timestamp | null;
}

export interface Affectation extends AffectationDoc {
  id: string;
}

export const AFFECTATIONS_COLLECTION = "affectations";
