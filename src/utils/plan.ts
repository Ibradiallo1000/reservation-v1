// src/utils/plan.ts
import type { SupportLevel } from "@/shared/subscription/types";

export type PlanModel = {
  id?: string;
  name: string;
  priceMonthly: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  maxUsers: number;
  supportLevel: SupportLevel;
};

export function companyPatchFromPlan(p: PlanModel) {
  return {
    planId: p.id || null,
    planName: p.name,
    digitalFeePercent: p.digitalFeePercent,
    feeGuichet: p.feeGuichet,
    minimumMonthly: p.minimumMonthly,
    maxAgences: p.maxAgences,
    maxUsers: p.maxUsers,
    supportLevel: p.supportLevel,
    publicPageEnabled: true,
    onlineBookingEnabled: true,
    guichetEnabled: true,
  };
}
