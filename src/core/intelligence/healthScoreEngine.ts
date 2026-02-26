// src/core/intelligence/healthScoreEngine.ts
// Pure: company health score 0-100 and category from margin, occupancy, discrepancies, transit, growth.
// No Firestore.

export type HealthCategory = "Critical" | "Fragile" | "Stable" | "Strong" | "Elite";

export interface HealthScoreInput {
  /** Company profit margin (0-1). */
  profitMargin: number;
  /** Occupancy rate (0-1 or 0-100, will be normalized to 0-1). */
  occupancyRate: number;
  /** Discrepancy ratio: sum of discrepancies / revenue (0 = none). */
  discrepancyRatio: number;
  /** Transit delay ratio: vehicles stale (e.g. >12h) / total in transit (0 = none). */
  transitDelayRatio: number;
  /** Revenue growth trend (e.g. percentage change last 7d vs prev 7d, -100 to +100). */
  revenueGrowthTrendPercent: number;
  /** Phase C3: cost discipline (0-1, higher = better). */
  costDisciplineRatio?: number;
  /** Phase C3: share of vehicles with positive profitability (0-1). */
  vehicleProfitabilityRatio?: number;
  /** Phase C3: expenses / revenue (0 = best). Will use 1 - min(1, x) for score. */
  expenseToRevenueRatio?: number;
  /** Phase C3: outstanding payables / revenue or assets (0 = best). Will use 1 - min(1, x). */
  outstandingPayablesRatio?: number;
}

export interface HealthScoreResult {
  score: number;
  category: HealthCategory;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Compute company health score 0-100 and category.
 * Weights: margin, occupancy, low discrepancy, low transit delay, positive growth.
 */
export function computeHealthScore(input: HealthScoreInput): HealthScoreResult {
  const margin = Number(input.profitMargin) || 0;
  let occ = Number(input.occupancyRate) || 0;
  if (occ > 1) occ = occ / 100;
  const discRatio = Math.min(1, Math.max(0, Number(input.discrepancyRatio) || 0));
  const transitRatio = Math.min(1, Math.max(0, Number(input.transitDelayRatio) || 0));
  const growth = Number(input.revenueGrowthTrendPercent) || 0;
  const costDiscipline = Math.min(1, Math.max(0, Number(input.costDisciplineRatio) ?? 0.5));
  const vehicleProfit = Math.min(1, Math.max(0, Number(input.vehicleProfitabilityRatio) ?? 0.5));
  const expenseToRev = Math.min(1, Math.max(0, Number(input.expenseToRevenueRatio) ?? 0));
  const payablesRatio = Math.min(1, Math.max(0, Number(input.outstandingPayablesRatio) ?? 0));

  // Component scores 0-100
  const marginScore = margin <= 0 ? 0 : Math.min(100, margin * 200); // 50% margin => 100
  const occupancyScore = Math.min(100, occ * 100);
  const discrepancyScore = 100 - discRatio * 100; // 0% discrepancy => 100
  const transitScore = 100 - transitRatio * 100;
  const growthScore = clamp(50 + growth, 0, 100); // 0% growth => 50, +50% => 100
  const costDisciplineScore = costDiscipline * 100;
  const vehicleProfitScore = vehicleProfit * 100;
  const expenseToRevScore = 100 - expenseToRev * 100; // 0 expense/revenue => 100
  const payablesScore = 100 - payablesRatio * 100;

  const hasPhaseC3 = [input.costDisciplineRatio, input.vehicleProfitabilityRatio, input.expenseToRevenueRatio, input.outstandingPayablesRatio].some((x) => x != null);
  const baseWeights = { margin: 0.25, occupancy: 0.2, discrepancy: 0.2, transit: 0.15, growth: 0.2 };
  const phaseC3Weights = { costDiscipline: 0.075, vehicleProfit: 0.075, expenseToRev: 0.075, payables: 0.075 };
  const score = Math.round(
    (marginScore * baseWeights.margin +
      occupancyScore * baseWeights.occupancy +
      discrepancyScore * baseWeights.discrepancy +
      transitScore * baseWeights.transit +
      growthScore * baseWeights.growth) * (hasPhaseC3 ? 0.7 : 1) +
    (hasPhaseC3
      ? costDisciplineScore * phaseC3Weights.costDiscipline +
        vehicleProfitScore * phaseC3Weights.vehicleProfit +
        expenseToRevScore * phaseC3Weights.expenseToRev +
        payablesScore * phaseC3Weights.payables
      : 0)
  );
  const clampedScore = clamp(score, 0, 100);

  let category: HealthCategory;
  if (clampedScore >= 85) category = "Elite";
  else if (clampedScore >= 70) category = "Strong";
  else if (clampedScore >= 50) category = "Stable";
  else if (clampedScore >= 30) category = "Fragile";
  else category = "Critical";

  return { score: clampedScore, category };
}
