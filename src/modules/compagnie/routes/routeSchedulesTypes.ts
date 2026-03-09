/**
 * Route schedules — company level.
 * Path: companies/{companyId}/routeSchedules/{scheduleId}
 * Links route, agency, bus, times and days.
 */

export const ROUTE_SCHEDULES_COLLECTION = "routeSchedules";

export type ScheduleStatus = "active" | "inactive" | "suspended";

export interface RouteScheduleDoc {
  routeId: string;
  agencyId: string;
  busId: string | null;           // optional vehicle id
  departureTime: string;          // e.g. "08:00"
  daysOfWeek: string[];           // e.g. ["monday", "tuesday"]
  status: ScheduleStatus;
}

export type RouteScheduleDocWithId = RouteScheduleDoc & { id: string };
