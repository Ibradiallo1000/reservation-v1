/**
 * Daily trip instances. Path: companies/{companyId}/tripInstances/{tripInstanceId}
 * Represents the real execution of a scheduled trip (WeeklyTrip → TripInstance).
 */
export const TRIP_INSTANCE_COLLECTION = "tripInstances";

export const TRIP_INSTANCE_STATUS = {
  SCHEDULED: "scheduled",
  BOARDING: "boarding",
  DEPARTED: "departed",
  ARRIVED: "arrived",
  CANCELLED: "cancelled",
} as const;

export type TripInstanceStatus =
  | "scheduled"
  | "boarding"
  | "departed"
  | "arrived"
  | "cancelled";

export interface TripInstanceDoc {
  companyId: string;
  /** Primary / origin agency. Kept for backward compat and simple queries. */
  agencyId: string;
  /** All agencies involved on this trip (e.g. Bamako → Sikasso → Bouaké). Enables intermediate loading, en-route boarding, per-agency stats. */
  agenciesInvolved?: string[];
  /** Route: departure city (alias departureCity for backward compat). */
  routeDeparture: string;
  /** Route: arrival city (alias arrivalCity for backward compat). */
  routeArrival: string;
  weeklyTripId: string | null;
  vehicleId: string | null;
  /** Date of departure (YYYY-MM-DD). */
  date: string;
  /** Departure date as Timestamp for queries. */
  departureDate?: unknown;
  departureTime: string;
  status: TripInstanceStatus;
  /** Confirmed passengers (reservations). Backward compat: use reservedSeats if absent. */
  passengerCount?: number;
  /** Parcels/shipments assigned to this instance. */
  parcelCount?: number;
  /** Bus seat capacity. Used for fill rate: passengerCount / capacitySeats (e.g. 34/50 = 68%). */
  capacitySeats?: number;
  /** Parcel capacity. Used for fill rate: parcelCount / capacityParcels. */
  capacityParcels?: number;
  createdAt?: unknown;
  createdBy?: string;
  updatedAt?: unknown;
  /** Backward compat: same as routeDeparture. */
  departureCity?: string;
  /** Backward compat: same as routeArrival. */
  arrivalCity?: string;
  /** Backward compat: seat capacity from weekly trip (prefer capacitySeats). */
  seatCapacity?: number;
  /** Backward compat: reserved seats (mirrors passengerCount). */
  reservedSeats?: number;
  routeId?: string | null;
  price?: number | null;
}

export type TripInstanceDocWithId = TripInstanceDoc & { id: string };
