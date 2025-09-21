// src/utils/plan.ts
export type PlanModel = {
  id?: string;
  name: string;
  priceMonthly: number;
  commissionOnline: number; // 0.02 = 2%
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  maxUsers: number;
  features: {
    publicPage: boolean;
    onlineBooking: boolean;
    guichet: boolean;
  };
};

export function companyPatchFromPlan(p: PlanModel) {
  return {
    planId: p.id || null,
    planName: p.name,
    // limites & tarifs copiés dans la compagnie
    commissionOnline: p.commissionOnline,
    feeGuichet: p.feeGuichet,
    minimumMonthly: p.minimumMonthly,
    maxAgences: p.maxAgences,
    maxUsers: p.maxUsers,
    publicPageEnabled: !!p.features.publicPage,
    onlineBookingEnabled: !!p.features.onlineBooking,
    guichetEnabled: !!p.features.guichet,
  };
}
