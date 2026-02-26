// src/core/intelligence/trendEngine.ts
// Pure logic: detect trends from time-series data (no Firestore).

export type TrendDirection = "up" | "down" | "stable";

export interface TrendResult {
  trend: TrendDirection;
  percentageChange: number;
  insight: string;
  type: string;
  referenceId?: string;
}

const STABLE_THRESHOLD_PCT = 2;

function toTrend(percentageChange: number): TrendDirection {
  if (percentageChange >= STABLE_THRESHOLD_PCT) return "up";
  if (percentageChange <= -STABLE_THRESHOLD_PCT) return "down";
  return "stable";
}

/**
 * Revenue trend: last 7 days vs previous 7 days.
 * Input: daily revenue totals (e.g. [{ date: "2025-02-19", revenue: 1000 }, ...]).
 */
export function computeRevenueTrend(
  last7Revenue: number,
  previous7Revenue: number
): TrendResult {
  const pct =
    previous7Revenue > 0
      ? ((last7Revenue - previous7Revenue) / previous7Revenue) * 100
      : (last7Revenue > 0 ? 100 : 0);
  const trend = toTrend(pct);
  const insight =
    trend === "up"
      ? `Revenus en hausse de ${pct.toFixed(1)}% (7 derniers jours vs 7 précédents).`
      : trend === "down"
        ? `Revenus en baisse de ${Math.abs(pct).toFixed(1)}% (7 derniers jours vs 7 précédents).`
        : "Revenus stables sur les deux dernières semaines.";
  return { trend, percentageChange: pct, insight, type: "revenue" };
}

/**
 * Occupancy trend: last 7 days average vs previous 7 days average.
 * Input: sums of passengers and seats per period.
 */
export function computeOccupancyTrend(
  last7Passengers: number,
  last7Seats: number,
  previous7Passengers: number,
  previous7Seats: number
): TrendResult {
  const rateLast = last7Seats > 0 ? last7Passengers / last7Seats : 0;
  const ratePrev = previous7Seats > 0 ? previous7Passengers / previous7Seats : 0;
  const pct =
    ratePrev > 0 ? ((rateLast - ratePrev) / ratePrev) * 100 : (rateLast > 0 ? 100 : 0);
  const trend = toTrend(pct);
  const insight =
    trend === "up"
      ? `Taux de remplissage en hausse de ${pct.toFixed(1)}% (7j vs 7j précédents).`
      : trend === "down"
        ? `Taux de remplissage en baisse de ${Math.abs(pct).toFixed(1)}% (7j vs 7j précédents).`
        : "Taux de remplissage stable.";
  return { trend, percentageChange: pct, insight, type: "occupancy" };
}

/**
 * Cost inflation: trip costs last 7 days vs previous 7 days.
 */
export function computeCostInflationTrend(
  last7Cost: number,
  previous7Cost: number
): TrendResult {
  const pct =
    previous7Cost > 0
      ? ((last7Cost - previous7Cost) / previous7Cost) * 100
      : (last7Cost > 0 ? 100 : 0);
  const trend = toTrend(pct);
  const insight =
    trend === "up"
      ? `Coûts opérationnels trajets en hausse de ${pct.toFixed(1)}% (7j vs 7j précédents).`
      : trend === "down"
        ? `Coûts opérationnels trajets en baisse de ${Math.abs(pct).toFixed(1)}%.`
        : "Coûts opérationnels trajets stables.";
  return { trend, percentageChange: pct, insight, type: "cost_inflation" };
}

export interface AgencyPeriodInput {
  agencyId: string;
  revenue: number;
}

/**
 * Agency performance: compare revenue last 7 vs previous 7 per agency.
 * Returns one trend per agency (or top movers). Company average change for context.
 */
export function computeAgencyPerformanceEvolution(
  last7ByAgency: AgencyPeriodInput[],
  previous7ByAgency: AgencyPeriodInput[],
  companyPctChange: number
): TrendResult[] {
  const results: TrendResult[] = [];
  const prevMap = new Map(previous7ByAgency.map((a) => [a.agencyId, a.revenue]));
  last7ByAgency.forEach((cur) => {
    const prev = prevMap.get(cur.agencyId) ?? 0;
    const pct = prev > 0 ? ((cur.revenue - prev) / prev) * 100 : (cur.revenue > 0 ? 100 : 0);
    const trend = toTrend(pct);
    const vsCompany =
      companyPctChange !== 0
        ? ` (compagnie: ${companyPctChange >= 0 ? "+" : ""}${companyPctChange.toFixed(1)}%)`
        : "";
    const insight =
      trend === "up"
        ? `Agence ${cur.agencyId} : revenus +${pct.toFixed(1)}%${vsCompany}.`
        : trend === "down"
          ? `Agence ${cur.agencyId} : revenus ${pct.toFixed(1)}%${vsCompany}.`
          : `Agence ${cur.agencyId} : revenus stables${vsCompany}.`;
    results.push({
      trend,
      percentageChange: pct,
      insight,
      type: "agency_performance",
      referenceId: cur.agencyId,
    });
  });
  return results;
}

export interface TrendEngineInput {
  /** Revenue per date (last 14 days). */
  revenueByDate: { date: string; revenue: number }[];
  /** Passengers and seats per date (last 14 days). */
  occupancyByDate: { date: string; totalPassengers: number; totalSeats: number }[];
  /** Trip costs per date (last 14 days). */
  costByDate: { date: string; cost: number }[];
  /** Revenue per agency per date (last 14 days) for agency evolution. */
  revenueByAgencyByDate: { date: string; agencyId: string; revenue: number }[];
  /** List of dates "last 7" (e.g. [TODAY-6, ..., TODAY]). */
  last7Dates: string[];
  /** List of dates "previous 7" (e.g. [TODAY-13, ..., TODAY-7]). */
  previous7Dates: string[];
}

/**
 * Compute all trends from 14-day inputs. Pure function.
 */
export function computeAllTrends(input: TrendEngineInput): TrendResult[] {
  const { revenueByDate, occupancyByDate, costByDate, revenueByAgencyByDate, last7Dates, previous7Dates } = input;
  const dateSetLast = new Set(last7Dates);
  const dateSetPrev = new Set(previous7Dates);

  let last7Rev = 0;
  let prev7Rev = 0;
  revenueByDate.forEach((d) => {
    if (dateSetLast.has(d.date)) last7Rev += d.revenue;
    if (dateSetPrev.has(d.date)) prev7Rev += d.revenue;
  });

  let last7P = 0,
    last7S = 0,
    prev7P = 0,
    prev7S = 0;
  occupancyByDate.forEach((d) => {
    if (dateSetLast.has(d.date)) {
      last7P += d.totalPassengers;
      last7S += d.totalSeats;
    }
    if (dateSetPrev.has(d.date)) {
      prev7P += d.totalPassengers;
      prev7S += d.totalSeats;
    }
  });

  let last7Cost = 0,
    prev7Cost = 0;
  costByDate.forEach((d) => {
    if (dateSetLast.has(d.date)) last7Cost += d.cost;
    if (dateSetPrev.has(d.date)) prev7Cost += d.cost;
  });

  const last7ByAgency = new Map<string, number>();
  const prev7ByAgency = new Map<string, number>();
  revenueByAgencyByDate.forEach((d) => {
    if (dateSetLast.has(d.date)) last7ByAgency.set(d.agencyId, (last7ByAgency.get(d.agencyId) ?? 0) + d.revenue);
    if (dateSetPrev.has(d.date)) prev7ByAgency.set(d.agencyId, (prev7ByAgency.get(d.agencyId) ?? 0) + d.revenue);
  });

  const companyPct =
    prev7Rev > 0 ? ((last7Rev - prev7Rev) / prev7Rev) * 100 : 0;

  const results: TrendResult[] = [];

  results.push(computeRevenueTrend(last7Rev, prev7Rev));
  results.push(computeOccupancyTrend(last7P, last7S, prev7P, prev7S));
  results.push(computeCostInflationTrend(last7Cost, prev7Cost));

  const agencyTrends = computeAgencyPerformanceEvolution(
    Array.from(last7ByAgency.entries()).map(([agencyId, revenue]) => ({ agencyId, revenue })),
    Array.from(prev7ByAgency.entries()).map(([agencyId, revenue]) => ({ agencyId, revenue })),
    companyPct
  );
  results.push(...agencyTrends);

  return results;
}
