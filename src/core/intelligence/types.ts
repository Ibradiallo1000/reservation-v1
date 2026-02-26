// src/core/intelligence/types.ts
// Input/output types for the Profit Engine. All data is injected; no Firestore dependency.

export interface ProfitResult {
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
}

/** Trip-level revenue and cost components (all optional for extension). */
export interface TripCostInput {
  fuel?: number;
  chauffeur?: number;
  convoyeur?: number;
  operational?: number;
  toll?: number;
  maintenance?: number;
  otherOperational?: number;
  mobileMoneyCommission?: number;
}

export interface TripProfitInput {
  tripId: string;
  /** Revenue from reservations (montant) or dailyStats trip-based if available. */
  revenue: number;
  /** Cost components; if missing, cost = 0 (structure supports future tagging). */
  costs?: TripCostInput;
  /** If canal === "en_ligne", mobile money commission can be applied. */
  canal?: string;
}

export interface AgencyProfitInput {
  agencyId: string;
  /** Total revenue from dailyStats for the period. */
  revenueFromDailyStats: number;
  /** Total expenses linked to this agencyId. */
  expensesTotal: number;
  /** Sum of tripCosts for this agency (operational costs per trip). */
  tripCostsTotal: number;
  /** Sum of (computedDifference when negative) — financial discrepancies. */
  discrepancyDeduction: number;
}

export interface CompanyProfitInput {
  /** Pre-calculated agency profits (allows 50+ agencies without nested loops). */
  agencyProfits: ProfitResult[];
}
