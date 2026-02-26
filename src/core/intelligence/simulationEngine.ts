// src/core/intelligence/simulationEngine.ts
// Pure what-if simulation: margin, occupancy, fuel cost. No Firestore. In-memory only.

export interface SimulationInput {
  /** Current total revenue (e.g. company today). */
  revenue: number;
  /** Current total cost (expenses + trip costs + discrepancies). */
  cost: number;
  /** Current total passengers. */
  passengers: number;
  /** Current total seats (for occupancy). */
  seats: number;
  /** Total fuel cost component (subset of cost) for fuel-specific simulation. */
  fuelCost: number;
}

export interface SimulationResult {
  newRevenue: number;
  newProfit: number;
  deltaProfit: number;
  /** Original profit (revenue - cost). */
  originalProfit: number;
}

/**
 * Simulate a ticket price (margin) increase.
 * newRevenue = revenue * (1 + marginIncreasePercent/100), cost unchanged.
 */
export function simulateMarginChange(
  input: SimulationInput,
  marginIncreasePercent: number
): SimulationResult {
  const revenue = Number(input.revenue) || 0;
  const cost = Number(input.cost) || 0;
  const originalProfit = revenue - cost;
  const factor = 1 + (Number(marginIncreasePercent) || 0) / 100;
  const newRevenue = revenue * factor;
  const newProfit = newRevenue - cost;
  return {
    newRevenue,
    newProfit,
    deltaProfit: newProfit - originalProfit,
    originalProfit,
  };
}

/**
 * Simulate occupancy increase: same revenue per seat but more seats filled.
 * Approximates: newRevenue = revenue * (1 + occupancyIncreasePercent/100) if we assume revenue scales with passengers.
 */
export function simulateOccupancyIncrease(
  input: SimulationInput,
  occupancyIncreasePercent: number
): SimulationResult {
  const revenue = Number(input.revenue) || 0;
  const cost = Number(input.cost) || 0;
  const originalProfit = revenue - cost;
  const factor = 1 + (Number(occupancyIncreasePercent) || 0) / 100;
  const newRevenue = revenue * factor;
  const newProfit = newRevenue - cost;
  return {
    newRevenue,
    newProfit,
    deltaProfit: newProfit - originalProfit,
    originalProfit,
  };
}

/**
 * Simulate fuel cost variation. cost = (cost - fuelCost) + fuelCost * (1 + fuelChangePercent/100).
 */
export function simulateFuelCostVariation(
  input: SimulationInput,
  fuelChangePercent: number
): SimulationResult {
  const revenue = Number(input.revenue) || 0;
  const cost = Number(input.cost) || 0;
  const fuelCost = Number(input.fuelCost) ?? 0;
  const nonFuelCost = cost - fuelCost;
  const factor = 1 + (Number(fuelChangePercent) || 0) / 100;
  const newFuelCost = fuelCost * factor;
  const newCost = nonFuelCost + newFuelCost;
  const originalProfit = revenue - cost;
  const newProfit = revenue - newCost;
  return {
    newRevenue: revenue,
    newProfit,
    deltaProfit: newProfit - originalProfit,
    originalProfit,
  };
}
