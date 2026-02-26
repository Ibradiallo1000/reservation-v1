// src/core/intelligence/revenueProjection.ts
// Pure functions: end-of-month revenue and profit projection from daily history.
// No Firestore. Spark-compatible.

export type ConfidenceLevel = "low" | "medium" | "high";

export interface DailyRevenueEntry {
  date: string;
  revenue: number;
}

export interface DailyProfitEntry {
  date: string;
  profit: number;
}

export interface RevenueProjectionResult {
  projectedRevenue: number;
  projectedProfit: number;
  confidenceLevel: ConfidenceLevel;
  currentRevenue: number;
  currentProfit: number;
  remainingDays: number;
  deltaRevenue: number;
  deltaProfit: number;
}

const DEFAULT_PERIOD_DAYS = 7;

export function calculateDailyAverage(
  history: { revenue?: number; profit?: number }[],
  periodDays: number = DEFAULT_PERIOD_DAYS
): { avgRevenue: number; avgProfit: number } {
  if (history.length === 0 || periodDays <= 0) {
    return { avgRevenue: 0, avgProfit: 0 };
  }
  const slice = history.slice(-periodDays);
  const sumRevenue = slice.reduce((s, e) => s + (Number((e as { revenue?: number }).revenue) ?? 0), 0);
  const sumProfit = slice.reduce((s, e) => s + (Number((e as { profit?: number }).profit) ?? 0), 0);
  const n = slice.length;
  return {
    avgRevenue: n > 0 ? sumRevenue / n : 0,
    avgProfit: n > 0 ? sumProfit / n : 0,
  };
}

export function confidenceFromHistoryDays(daysWithData: number): ConfidenceLevel {
  if (daysWithData < 5) return "low";
  if (daysWithData <= 14) return "medium";
  return "high";
}

export function projectEndOfMonthRevenue(
  dailyRevenueHistory: DailyRevenueEntry[],
  currentMonthAccumulatedRevenue: number,
  todayDate: Date
): { projectedRevenue: number; dailyAvg: number; remainingDays: number; confidenceLevel: ConfidenceLevel } {
  const last7 = dailyRevenueHistory.slice(-7);
  const dailyAvg = last7.length > 0
    ? last7.reduce((s, e) => s + (Number(e.revenue) || 0), 0) / last7.length
    : 0;
  const year = todayDate.getFullYear();
  const month = todayDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = todayDate.getDate();
  const remainingDays = Math.max(0, lastDay - dayOfMonth);
  const projectedRevenue = currentMonthAccumulatedRevenue + dailyAvg * remainingDays;
  const uniqueDays = new Set(dailyRevenueHistory.map((e) => e.date)).size;
  const confidenceLevel = confidenceFromHistoryDays(uniqueDays);
  return {
    projectedRevenue,
    dailyAvg,
    remainingDays,
    confidenceLevel,
  };
}

export function projectEndOfMonthProfit(
  dailyProfitHistory: DailyProfitEntry[],
  currentMonthAccumulatedProfit: number,
  todayDate: Date
): { projectedProfit: number; dailyAvg: number; remainingDays: number; confidenceLevel: ConfidenceLevel } {
  const last7 = dailyProfitHistory.slice(-7);
  const dailyAvg = last7.length > 0
    ? last7.reduce((s, e) => s + (Number(e.profit) || 0), 0) / last7.length
    : 0;
  const year = todayDate.getFullYear();
  const month = todayDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const dayOfMonth = todayDate.getDate();
  const remainingDays = Math.max(0, lastDay - dayOfMonth);
  const projectedProfit = currentMonthAccumulatedProfit + dailyAvg * remainingDays;
  const uniqueDays = new Set(dailyProfitHistory.map((e) => e.date)).size;
  const confidenceLevel = confidenceFromHistoryDays(uniqueDays);
  return {
    projectedProfit,
    dailyAvg,
    remainingDays,
    confidenceLevel,
  };
}

export function projectEndOfMonth(
  dailyRevenueHistory: DailyRevenueEntry[],
  dailyProfitHistory: DailyProfitEntry[],
  currentMonthAccumulatedRevenue: number,
  currentMonthAccumulatedProfit: number,
  todayDate: Date = new Date()
): RevenueProjectionResult {
  const rev = projectEndOfMonthRevenue(
    dailyRevenueHistory,
    currentMonthAccumulatedRevenue,
    todayDate
  );
  const prof = projectEndOfMonthProfit(
    dailyProfitHistory,
    currentMonthAccumulatedProfit,
    todayDate
  );
  const confidenceLevel =
    rev.confidenceLevel === "low" || prof.confidenceLevel === "low"
      ? "low"
      : rev.confidenceLevel === "medium" || prof.confidenceLevel === "medium"
        ? "medium"
        : "high";
  return {
    projectedRevenue: rev.projectedRevenue,
    projectedProfit: prof.projectedProfit,
    confidenceLevel,
    currentRevenue: currentMonthAccumulatedRevenue,
    currentProfit: currentMonthAccumulatedProfit,
    remainingDays: rev.remainingDays,
    deltaRevenue: rev.projectedRevenue - currentMonthAccumulatedRevenue,
    deltaProfit: prof.projectedProfit - currentMonthAccumulatedProfit,
  };
}
