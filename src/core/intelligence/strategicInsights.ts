// src/core/intelligence/strategicInsights.ts
// Pure logic: generate strategic insights from anomalies + trends.

import type { Anomaly } from "./anomalyEngine";
import type { TrendResult } from "./trendEngine";

export type InsightLevel = "info" | "warning" | "critical";

export interface StrategicInsight {
  level: InsightLevel;
  message: string;
}

export interface StrategicInsightsInput {
  anomalies: Anomaly[];
  trends: TrendResult[];
  agencyNames?: (agencyId: string) => string;
}

/**
 * Generate strategic insights from anomalies and trends.
 * Examples: declining occupancy, fuel cost increase, agency outperformance.
 */
export function generateStrategicInsights(input: StrategicInsightsInput): StrategicInsight[] {
  const { anomalies, trends, agencyNames } = input;
  const name = (id: string) => (agencyNames ? agencyNames(id) : id);
  const out: StrategicInsight[] = [];

  const hasHighAnomaly = anomalies.some((a) => a.severity === "high");
  const hasNegativeProfit = anomalies.some((a) => a.type === "trip_negative_profit");
  const hasCashDiscrepancy = anomalies.some((a) => a.type === "cash_discrepancy_high");

  if (hasHighAnomaly) {
    if (hasNegativeProfit)
      out.push({
        level: "critical",
        message: "Au moins un trajet est en perte. Vérifier les coûts et tarifs.",
      });
    if (hasCashDiscrepancy)
      out.push({
        level: "critical",
        message: "Écarts de caisse au-dessus du seuil sur une ou plusieurs agences. Contrôle recommandé.",
      });
  }

  const revenueTrend = trends.find((t) => t.type === "revenue");
  if (revenueTrend && revenueTrend.trend === "down" && revenueTrend.percentageChange < -5) {
    out.push({
      level: "warning",
      message: `Revenus en baisse de ${Math.abs(revenueTrend.percentageChange).toFixed(0)}% sur les 7 derniers jours par rapport à la semaine précédente.`,
    });
  }
  if (revenueTrend && revenueTrend.trend === "up" && revenueTrend.percentageChange > 10) {
    out.push({
      level: "info",
      message: `Revenus en hausse de ${revenueTrend.percentageChange.toFixed(0)}% (7j vs 7j précédents).`,
    });
  }

  const occupancyTrend = trends.find((t) => t.type === "occupancy");
  if (occupancyTrend && occupancyTrend.trend === "down" && occupancyTrend.percentageChange < -5) {
    out.push({
      level: "warning",
      message: `Taux de remplissage en baisse de ${Math.abs(occupancyTrend.percentageChange).toFixed(0)}% sur la période. Envisager des actions commerciales ou d'offre.`,
    });
  }

  const costTrend = trends.find((t) => t.type === "cost_inflation");
  if (costTrend && costTrend.trend === "up" && costTrend.percentageChange > 10) {
    out.push({
      level: "warning",
      message: `Coûts opérationnels trajets en hausse de ${costTrend.percentageChange.toFixed(0)}% cette semaine. Vérifier carburant et coûts directs.`,
    });
  }

  const agencyTrends = trends.filter((t) => t.type === "agency_performance");
  const topOutperformers = agencyTrends
    .filter((t) => t.percentageChange >= 15)
    .slice(0, 3);
  topOutperformers.forEach((t) => {
    const agencyId = t.referenceId ?? "agence";
    out.push({
      level: "info",
      message: `${name(agencyId)} dépasse la tendance : revenus +${t.percentageChange.toFixed(0)}% (7j vs 7j précédents).`,
    });
  });

  const underperformers = agencyTrends
    .filter((t) => t.percentageChange <= -10)
    .slice(0, 3);
  underperformers.forEach((t) => {
    const agencyId = t.referenceId ?? "agence";
    out.push({
      level: "warning",
      message: `${name(agencyId)} : revenus en baisse de ${Math.abs(t.percentageChange).toFixed(0)}% sur la période.`,
    });
  });

  if (out.length === 0) {
    out.push({
      level: "info",
      message: "Aucune alerte stratégique majeure. Situation stable.",
    });
  }

  return out;
}

/** Group insights by level for display. */
export function groupInsightsByLevel(insights: StrategicInsight[]): {
  critical: StrategicInsight[];
  warning: StrategicInsight[];
  info: StrategicInsight[];
} {
  const critical: StrategicInsight[] = [];
  const warning: StrategicInsight[] = [];
  const info: StrategicInsight[] = [];
  insights.forEach((i) => {
    if (i.level === "critical") critical.push(i);
    else if (i.level === "warning") warning.push(i);
    else info.push(i);
  });
  return { critical, warning, info };
}
