/**
 * Daily trip instances. Path: companies/{companyId}/tripInstances/{tripInstanceId}
 */
export const TRIP_INSTANCE_COLLECTION = "tripInstances";

export const TRIP_INSTANCE_STATUS = {
  SCHEDULED: "SCHEDULED",
  BOARDING: "BOARDING",
  DEPARTED: "DEPARTED",
  ARRIVED: "ARRIVED",
  CANCELLED: "CANCELLED",
} as const;

export type TripInstanceStatus = (typeof TRIP_INSTANCE_STATUS)[keyof typeof TRIP_INSTANCE_STATUS];

export interface TripInstanceDoc {
  routeId?: string | null;
  agencyId: string;
  departureCity: string;
  arrivalCity: string;
  date: string;
  departureTime: string;
  vehicleId?: string | null;
  seatCapacity: number;
  reservedSeats: number;
  status: TripInstanceStatus;
  /** Price per seat (from weeklyTrip, for display). */
  price?: number | null;
  weeklyTripId?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type TripInstanceDocWithId = TripInstanceDoc & { id: string };
