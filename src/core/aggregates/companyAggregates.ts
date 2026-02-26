// src/core/aggregates/companyAggregates.ts
// Company-level precomputed aggregates: companies/{companyId}/aggregates/current
// Reduces collectionGroup scans when CEO reads a single document.
// Update strategy: call from existing transactions (dailyStats, agencyLiveState) or nightly job.

export const AGGREGATES_DOC_ID = "current";

export interface CompanyAggregatesDoc {
  todayRevenue: number;
  todayProfit: number;
  todayPassengers: number;
  activeSessions: number;
  boardingOpenCount: number;
  vehiclesInTransit: number;
  updatedAt: unknown; // Firestore Timestamp
}

export interface DailyStatsRow {
  totalRevenue?: number;
  totalPassengers?: number;
  totalSeats?: number;
  agencyId?: string;
}

export interface AgencyLiveStateRow {
  activeSessionsCount?: number;
  boardingOpenCount?: number;
  vehiclesInTransitCount?: number;
}

/**
 * Pure: compute aggregate snapshot from in-memory data (e.g. already loaded by CEO).
 * Use when aggregates/current is not yet populated or for fallback.
 */
export function computeAggregatesFromSnapshot(
  dailyStatsToday: DailyStatsRow[],
  liveStateList: AgencyLiveStateRow[],
  todayProfit: number
): Omit<CompanyAggregatesDoc, "updatedAt"> {
  const todayRevenue = dailyStatsToday.reduce(
    (s, d) => s + (Number(d.totalRevenue) || 0),
    0
  );
  const todayPassengers = dailyStatsToday.reduce(
    (s, d) => s + (Number(d.totalPassengers) || 0),
    0
  );
  const activeSessions = liveStateList.reduce(
    (s, d) => s + (Number(d.activeSessionsCount) || 0),
    0
  );
  const boardingOpenCount = liveStateList.reduce(
    (s, d) => s + (Number(d.boardingOpenCount) || 0),
    0
  );
  const vehiclesInTransit = liveStateList.reduce(
    (s, d) => s + (Number(d.vehiclesInTransitCount) || 0),
    0
  );
  return {
    todayRevenue,
    todayProfit,
    todayPassengers,
    activeSessions,
    boardingOpenCount,
    vehiclesInTransit,
  };
}
