/**
 * Teliya SaaS – Revenue Calculation Helpers
 *
 * Used for tracking digital channel fees and SaaS revenue.
 */

/* ====================================================================
   DIGITAL FEE CALCULATION
==================================================================== */

/**
 * Calculate the digital channel fee for a given reservation amount.
 *
 * @param amount - Total reservation amount in currency units
 * @param digitalFeePercent - Fee percentage (e.g., 2 means 2%)
 * @returns The fee amount in currency units (rounded to nearest integer)
 */
export function calculateDigitalFee(
  amount: number,
  digitalFeePercent: number,
): number {
  if (amount <= 0 || digitalFeePercent <= 0) return 0;
  return Math.round((amount * digitalFeePercent) / 100);
}

/**
 * Calculate the net amount after deducting the digital fee.
 *
 * @param amount - Total reservation amount in currency units
 * @param digitalFeePercent - Fee percentage
 * @returns Net amount for the company
 */
export function calculateNetAmount(
  amount: number,
  digitalFeePercent: number,
): number {
  return amount - calculateDigitalFee(amount, digitalFeePercent);
}

/* ====================================================================
   REVENUE SUMMARY BUILDER
==================================================================== */

export interface RevenueSummary {
  totalReservationAmount: number;
  totalDigitalFees: number;
  netCompanyRevenue: number;
  feePercent: number;
}

/**
 * Build a revenue summary from a list of reservation amounts.
 */
export function buildRevenueSummary(
  amounts: number[],
  digitalFeePercent: number,
): RevenueSummary {
  const totalReservationAmount = amounts.reduce((sum, a) => sum + a, 0);
  const totalDigitalFees = amounts.reduce(
    (sum, a) => sum + calculateDigitalFee(a, digitalFeePercent),
    0,
  );

  return {
    totalReservationAmount,
    totalDigitalFees,
    netCompanyRevenue: totalReservationAmount - totalDigitalFees,
    feePercent: digitalFeePercent,
  };
}
