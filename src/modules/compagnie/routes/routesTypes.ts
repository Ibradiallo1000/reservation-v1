/**
 * Company-level route registry with optional stops (escales).
 * Path: companies/{companyId}/routes/{routeId}
 * Subcollection: companies/{companyId}/routes/{routeId}/stops (escales)
 * Company defines routes; agencies configure schedules/prices on routes where departureCity === agency.city.
 */

export const ROUTES_COLLECTION = "routes";
export const ROUTE_STOPS_SUBCOLLECTION = "stops";

export const ROUTE_STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;
export type RouteStatus = (typeof ROUTE_STATUS)[keyof typeof ROUTE_STATUS];

export interface RouteDoc {
  /** Origin city (start of route). Alias: departureCity for backward compat. */
  origin: string;
  /** Destination city (end of route). Alias: arrivalCity for backward compat. */
  destination: string;
  /** Distance in km. */
  distanceKm?: number | null;
  /** Estimated duration in minutes. */
  estimatedDurationMinutes?: number | null;
  /** @deprecated Use origin. Kept for backward compat / listRoutesByDepartureCity. */
  departureCity?: string;
  /** @deprecated Use destination. Kept for backward compat. */
  arrivalCity?: string;
  /** @deprecated Use distanceKm. */
  distance?: number | null;
  /** @deprecated Use estimatedDurationMinutes. */
  estimatedDuration?: number | null;
  status?: RouteStatus;
  createdAt?: { seconds: number; nanoseconds: number } | unknown;
  updatedAt?: { seconds: number; nanoseconds: number } | unknown;
}

export type RouteDocWithId = RouteDoc & { id: string };

/** One stop (escale) on a route. Path: companies/{companyId}/routes/{routeId}/stops/{stopId} */
export interface RouteStopDoc {
  city: string;
  /** Optional reference to a city document (villes or similar). */
  cityId?: string | null;
  order: number;
  distanceFromStartKm?: number | null;
  estimatedArrivalOffsetMinutes?: number | null;
  /** Passagers peuvent monter à cette escale. Default true. */
  boardingAllowed?: boolean;
  /** Passagers peuvent descendre à cette escale. Default true. */
  dropoffAllowed?: boolean;
}

export type RouteStopDocWithId = RouteStopDoc & { id: string };

/** Agency type: principale = agence classique, escale = point d'escale (agent escale). */
export const AGENCY_TYPE = {
  PRINCIPALE: "principale",
  ESCALE: "escale",
} as const;
export type AgencyType = (typeof AGENCY_TYPE)[keyof typeof AGENCY_TYPE];
