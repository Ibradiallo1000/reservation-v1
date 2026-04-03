import type { FieldValue, Timestamp } from "firebase/firestore";

export type TripExecutionStatus =
  | "boarding"
  | "validation_agence_requise"
  | "departed"
  | "transit"
  | "arrived"
  | "finished"
  | "disrupted";

export type TimestampOrFieldValue = Timestamp | FieldValue;

export type TripExecutionCheckpoint = {
  stopOrder: number;
  city: string;
  arrivalTime?: TimestampOrFieldValue | null;
  departureTime?: TimestampOrFieldValue | null;
  /** Montées (réservations dont originStopOrder==stopOrder et boardingStatus=='boarded'). */
  montées?: number;
  /** Descentes (réservations dont destinationStopOrder==stopOrder et dropoffStatus=='dropped'). */
  descentes?: number;
};

export type TripExecutionVehicleSnapshot = {
  plateNumber?: string;
  driverName?: string;
  convoyeurName?: string;
};

export type TripExecutionDoc = {
  companyId: string;
  tripInstanceId: string;
  tripExecutionDate: string; // YYYY-MM-DD

  tripAssignmentId: string;
  vehicleId: string;
  vehicleSnapshot?: TripExecutionVehicleSnapshot;

  departureAgencyId: string;
  arrivalAgencyId?: string | null;
  destinationCity: string;

  passengersCount: number;
  status: TripExecutionStatus;

  boardingStartedAt?: TimestampOrFieldValue | null;
  boardingCompletedAt?: TimestampOrFieldValue | null;
  boardingCompletedBy?: string | null;
  agencyValidationRequiredAt?: TimestampOrFieldValue | null;
  agencyValidatedAt?: TimestampOrFieldValue | null;
  agencyValidatedBy?: string | null;
  departureValidatedAt?: TimestampOrFieldValue | null;
  departureValidatedBy?: string | null;
  departedAt?: TimestampOrFieldValue | null;
  transitAt?: TimestampOrFieldValue | null;
  arrivedAt?: TimestampOrFieldValue | null;
  finishedAt?: TimestampOrFieldValue | null;

  checkpoints?: TripExecutionCheckpoint[];

  updatedAt?: unknown;
};

export type TripExecutionDocWithId = TripExecutionDoc & { id: string };

