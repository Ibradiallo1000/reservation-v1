import {
  AGENCIES_AT_RISK_CRITICAL_COUNT,
  REVENUE_CRITICAL_DROP,
  REVENUE_WARNING_DROP,
} from "@/modules/compagnie/commandCenter/strategicThresholds";

export type CeoGlobalStatus = "stable" | "attention" | "danger";
export type CeoRiskLevel = "warning" | "danger";

type ComputeStatusInput = {
  revenueDropPercent: number;
  accountsBelowCritical: number;
  accountsBelowWarning: number;
  agenciesAtRiskCount: number;
};

export function computeCeoGlobalStatus(input: ComputeStatusInput): CeoGlobalStatus {
  const {
    revenueDropPercent,
    accountsBelowCritical,
    accountsBelowWarning,
    agenciesAtRiskCount,
  } = input;

  if (
    revenueDropPercent >= REVENUE_CRITICAL_DROP ||
    accountsBelowCritical > 0 ||
    agenciesAtRiskCount >= AGENCIES_AT_RISK_CRITICAL_COUNT
  ) {
    return "danger";
  }

  if (
    (revenueDropPercent >= REVENUE_WARNING_DROP &&
      revenueDropPercent < REVENUE_CRITICAL_DROP) ||
    accountsBelowWarning > 0
  ) {
    return "attention";
  }

  return "stable";
}

export function getCeoStatusLabelFr(status: CeoGlobalStatus): string {
  if (status === "danger") return "Danger";
  if (status === "attention") return "Attention";
  return "Stable";
}

export function getCeoRiskLevelLabelFr(level: CeoRiskLevel): string {
  return level === "danger" ? "Danger" : "Attention";
}
