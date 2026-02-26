export type {
  ProfitResult,
  TripProfitInput,
  TripCostInput,
  AgencyProfitInput,
  CompanyProfitInput,
} from "./types";
export {
  calculateTripProfit,
  calculateAgencyProfit,
  calculateCompanyProfit,
} from "./profitEngine";
export {
  TRIP_COSTS_COLLECTION,
  type TripCostDoc,
  type TripCostDocCreate,
  totalOperationalCost,
  tripCostDocToInput,
} from "./tripCosts";
export {
  createTripCost,
  updateTripCost,
  listTripCosts,
  getTripCost,
} from "./tripCostsService";
export {
  RISK_SETTINGS_COLLECTION,
  RISK_SETTINGS_DOC_ID,
  type RiskSettingsDoc,
  DEFAULT_RISK_SETTINGS,
  mergeWithDefaults,
} from "./riskSettings";
export { getRiskSettings } from "./riskSettingsService";
export {
  detectAnomalies,
  groupAnomaliesBySeverity,
  type Anomaly,
  type AnomalySeverity,
  type AnomalyEngineInput,
} from "./anomalyEngine";
export {
  computeAllTrends,
  computeRevenueTrend,
  computeOccupancyTrend,
  computeCostInflationTrend,
  computeAgencyPerformanceEvolution,
  type TrendResult,
  type TrendDirection,
  type TrendEngineInput,
  type AgencyPeriodInput,
} from "./trendEngine";
export {
  generateStrategicInsights,
  groupInsightsByLevel,
  type StrategicInsight,
  type InsightLevel,
  type StrategicInsightsInput,
} from "./strategicInsights";
export {
  projectEndOfMonth,
  projectEndOfMonthRevenue,
  projectEndOfMonthProfit,
  calculateDailyAverage,
  confidenceFromHistoryDays,
  type RevenueProjectionResult,
  type ConfidenceLevel,
  type DailyRevenueEntry,
  type DailyProfitEntry,
} from "./revenueProjection";
export {
  simulateMarginChange,
  simulateOccupancyIncrease,
  simulateFuelCostVariation,
  type SimulationInput,
  type SimulationResult,
} from "./simulationEngine";
export {
  computeHealthScore,
  type HealthScoreInput,
  type HealthScoreResult,
  type HealthCategory,
} from "./healthScoreEngine";
