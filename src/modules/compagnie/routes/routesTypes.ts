/**
 * Company-level route registry.
 * Path: companies/{companyId}/routes/{routeId}
 * Company defines routes; agencies only configure schedules/prices on routes where departureCity === agency.city.
 */

export const ROUTES_COLLECTION = "routes";

export const ROUTE_STATUS = {
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
} as const;
export type RouteStatus = (typeof ROUTE_STATUS)[keyof typeof ROUTE_STATUS];

export interface RouteDoc {
  departureCity: string;
  arrivalCity: string;
  distance?: number | null;       // km
  estimatedDuration?: number | null; // minutes
  status?: RouteStatus;           // ACTIVE | DISABLED; optional for backward compat (default ACTIVE)
  createdAt?: { seconds: number; nanoseconds: number } | unknown;
  updatedAt?: { seconds: number; nanoseconds: number } | unknown;
}

export type RouteDocWithId = RouteDoc & { id: string };
