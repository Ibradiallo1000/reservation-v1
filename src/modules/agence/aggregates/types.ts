// src/modules/agence/aggregates/types.ts
// Phase 4.5: Aggregated state documents for scalability.
import type { Timestamp } from "firebase/firestore";

/**
 * companies/{companyId}/agences/{agencyId}/dailyStats/{YYYY-MM-DD}
 */
export interface DailyStatsDoc {
  date: string;
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
  vehiclesInTransitCount: number;
  boardingOpenCount: number;
  lastUpdatedAt: Timestamp;
}

export function boardingStatsKey(dep: string, arr: string, heure: string, date: string): string {
  return `${(dep || "").trim()}_${(arr || "").trim()}_${(heure || "").trim()}_${(date || "")}`.replace(/\s+/g, "-");
}
