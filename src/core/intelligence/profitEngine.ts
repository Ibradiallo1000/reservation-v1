// src/core/intelligence/profitEngine.ts
// Pure functions only. No Firestore. All data injected by caller.

import type {
  ProfitResult,
  TripProfitInput,
  AgencyProfitInput,
  CompanyProfitInput,
} from "./types";

function margin(revenue: number, profit: number): number {
  if (revenue <= 0) return 0;
  return profit / revenue;
}

/**
 * Trip profit: revenue minus costs.
 * Total cost = fuel + chauffeur + convoyeur + operational + toll + maintenance + otherOperational
 *              + mobileMoneyCommission (if canal en_ligne).
 * If no tripCosts / costs provided, cost = 0.
 */
export function calculateTripProfit(input: TripProfitInput): ProfitResult {
  const revenue = Number(input.revenue) || 0;

  let cost = 0;
  const c = input.costs;
  if (c) {
    cost += Number(c.fuel) || 0;
    cost += Number(c.chauffeur) || 0;
    cost += Number(c.convoyeur) || 0;
    cost += Number(c.operational) || 0;
    cost += Number(c.toll) || 0;
    cost += Number(c.maintenance) || 0;
    cost += Number(c.otherOperational) || 0;
    if (input.canal === "en_ligne" && (Number(c.mobileMoneyCommission) || 0) > 0) {
      cost += Number(c.mobileMoneyCommission) || 0;
    }
  }

  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    margin: margin(revenue, profit),
  };
}

/**
 * Agency profit = revenue (dailyStats) − expenses − sum(tripCosts) − discrepancies.
 */
export function calculateAgencyProfit(input: AgencyProfitInput): ProfitResult {
  const revenue = Number(input.revenueFromDailyStats) || 0;
  const cost =
    (Number(input.expensesTotal) || 0) +
    (Number(input.tripCostsTotal) || 0) +
    (Number(input.discrepancyDeduction) || 0);
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    margin: margin(revenue, profit),
  };
}

/**
 * Company profit = sum of all agency profits. O(n) over agency count; no nested loops.
 */
export function calculateCompanyProfit(input: CompanyProfitInput): ProfitResult {
  let revenue = 0;
  let cost = 0;
  for (const p of input.agencyProfits) {
    revenue += Number(p.revenue) || 0;
    cost += Number(p.cost) || 0;
  }
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    margin: margin(revenue, profit),
  };
}
