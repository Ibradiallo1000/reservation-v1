// src/modules/agence/aggregates/types.ts
// Phase 4.5: Aggregated state documents for scalability.
import type { Timestamp } from "firebase/firestore";

/**
 * companies/{companyId}/agences/{agencyId}/dailyStats/{YYYY-MM-DD}
 * totalRevenue = ticketRevenue + courierRevenue (for global revenue).
 */
export interface DailyStatsDoc {
  date: string;
  /** Revenue from ticket reservations (guichet + online). */
  ticketRevenue?: number;
  /** Revenue from courier shipments (paid only). */
  courierRevenue?: number;
  /** Total revenue (ticketRevenue + courierRevenue). Legacy docs may only have totalRevenue. */
  totalRevenue: number;
  totalPassengers: number;
  totalSeats: number;
  validatedSessions: number;
  activeSessions: number;
  closedSessions: number;
  boardingClosedCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Helper: ticket revenue from dailyStats (fallback to totalRevenue for legacy docs). */
export function getTicketRevenue(d: DailyStatsDoc): number {
  return Number(d.ticketRevenue ?? d.totalRevenue ?? 0);
}

/** Helper: courier revenue from dailyStats. */
export function getCourierRevenue(d: DailyStatsDoc): number {
  return Number(d.courierRevenue ?? 0);
}

/** Helper: total revenue (prefer explicit totalRevenue for consistency). */
export function getTotalRevenue(d: DailyStatsDoc): number {
  const ticket = getTicketRevenue(d);
  const courier = getCourierRevenue(d);
  const stored = Number(d.totalRevenue ?? 0);
  return stored > 0 ? stored : ticket + courier;
}

/**
 * companies/{companyId}/agences/{agencyId}/boardingStats/{tripKey}
 * tripKey = departure_arrival_heure_date (normalized)
 */
export interface BoardingStatsDoc {
  tripId: string | null;
  date: string;
  heure: string;
  vehicleCapacity: number;
  embarkedSeats: number;
  absentSeats: number;
  status: "open" | "closed";
  updatedAt: Timestamp;
}

/**
 * companies/{companyId}/agences/{agencyId}/agencyLiveState/current
 */
export interface AgencyLiveStateDoc {
  activeSessionsCount: number;
  closedPendingValidationCount: number;
  /** Active courier sessions (ACTIVE status). */
  activeCourierSessionsCount?: number;
  /** Courier sessions CLOSED and not yet VALIDATED. */
  closedCourierPendingValidationCount?: number;
  vehiclesInTransitCount: number;
  boardingOpenCount: number;
  lastUpdatedAt: Timestamp;
}

export function boardingStatsKey(dep: string, arr: string, heure: string, date: string): string {
  return `${(dep || "").trim()}_${(arr || "").trim()}_${(heure || "").trim()}_${(date || "")}`.replace(/\s+/g, "-");
}
