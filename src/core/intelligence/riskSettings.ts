// src/core/intelligence/riskSettings.ts
// Configurable thresholds for anomaly detection.
// Firestore: companies/{companyId}/riskSettings/current

export const RISK_SETTINGS_COLLECTION = "riskSettings";
export const RISK_SETTINGS_DOC_ID = "current";

export interface RiskSettingsDoc {
  minimumMarginPercent: number;
  maxTransitHours: number;
  maxCashDiscrepancy: number;
  minimumOccupancyRate: number;
  /** Phase C3: vehicle cost vs 30-day avg — e.g. 50 = 50% increase triggers anomaly. */
  vehicleCostExplosionPercent?: number;
  /** Phase C3: maintenance count in 30d above this triggers spike anomaly. */
  maintenanceSpikeCountThreshold?: number;
  /** Phase C3: trip fuel cost above this share of revenue triggers (0.2 = 20%). */
  tripFuelCostMarginThreshold?: number;
}

export const DEFAULT_RISK_SETTINGS: RiskSettingsDoc = {
  minimumMarginPercent: 10,
  maxTransitHours: 12,
  maxCashDiscrepancy: 5000,
  minimumOccupancyRate: 50,
  vehicleCostExplosionPercent: 50,
  maintenanceSpikeCountThreshold: 5,
  tripFuelCostMarginThreshold: 0.2,
};

export function mergeWithDefaults(partial: Partial<RiskSettingsDoc> | null): RiskSettingsDoc {
  if (!partial || typeof partial !== "object") return DEFAULT_RISK_SETTINGS;
  return {
    minimumMarginPercent: Number(partial.minimumMarginPercent) >= 0 ? Number(partial.minimumMarginPercent) : DEFAULT_RISK_SETTINGS.minimumMarginPercent,
    maxTransitHours: Number(partial.maxTransitHours) > 0 ? Number(partial.maxTransitHours) : DEFAULT_RISK_SETTINGS.maxTransitHours,
    maxCashDiscrepancy: Number(partial.maxCashDiscrepancy) >= 0 ? Number(partial.maxCashDiscrepancy) : DEFAULT_RISK_SETTINGS.maxCashDiscrepancy,
    minimumOccupancyRate: Number(partial.minimumOccupancyRate) >= 0 && Number(partial.minimumOccupancyRate) <= 100
      ? Number(partial.minimumOccupancyRate)
      : DEFAULT_RISK_SETTINGS.minimumOccupancyRate,
    vehicleCostExplosionPercent: Number(partial.vehicleCostExplosionPercent) >= 0 ? Number(partial.vehicleCostExplosionPercent) : DEFAULT_RISK_SETTINGS.vehicleCostExplosionPercent ?? 50,
    maintenanceSpikeCountThreshold: Number(partial.maintenanceSpikeCountThreshold) >= 0 ? Number(partial.maintenanceSpikeCountThreshold) : DEFAULT_RISK_SETTINGS.maintenanceSpikeCountThreshold ?? 5,
    tripFuelCostMarginThreshold: Number(partial.tripFuelCostMarginThreshold) >= 0 ? Number(partial.tripFuelCostMarginThreshold) : DEFAULT_RISK_SETTINGS.tripFuelCostMarginThreshold ?? 0.2,
  };
}
