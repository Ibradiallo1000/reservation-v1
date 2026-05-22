// src/core/subscription/plans.ts
// Defines subscription plans and their unlocked capabilities.
// Plans control WHAT features are available; roles control WHO can use them.

import type { Capability } from "@/core/permissions/capabilities";

export type Plan = "standard" | "premium";
export type LegacyPlan = "starter" | "growth" | "enterprise";
export type AnyPlan = Plan | LegacyPlan | string | null | undefined;

const STANDARD_CAPABILITIES: readonly Capability[] = [
  "view_agency_dashboard",
  "manage_agency_finances",
  "manage_company_finances",
  "manage_reservations",
  "manage_guichet",
  "manage_boarding",
  "manage_agency_fleet",
  "manage_personnel",
  "manage_agency_trajets",
  "view_agency_stats",
  "manage_logistics",
];

const PREMIUM_CAPABILITIES: readonly Capability[] = [
  ...STANDARD_CAPABILITIES,
  "manage_treasury",
  "manage_multi_bank",
  "view_global_dashboard",
  "validate_sessions",
  "manage_global_fleet",
  "manage_roles",
  "manage_company_settings",
  "view_company_stats",
  "view_profit_analysis",
  "view_anomaly_engine",
  "view_predictive_insights",
  "use_simulation_engine",
  "access_enterprise_features",
  "view_advanced_reports",
  "access_ledger",
  "view_financial_analytics",
  "manage_multi_agency",
];

const PLAN_CAPABILITIES: Record<Plan, readonly Capability[]> = {
  standard: STANDARD_CAPABILITIES,
  premium: PREMIUM_CAPABILITIES,
};

export const PLAN_HIERARCHY: readonly Plan[] = ["standard", "premium"];

export function normalizePlan(plan: AnyPlan): Plan {
  const raw = String(plan ?? "").trim().toLowerCase();
  if (raw === "premium" || raw === "growth" || raw === "enterprise") return "premium";
  return "standard";
}

export function getPlanCapabilities(plan: AnyPlan): readonly Capability[] {
  return PLAN_CAPABILITIES[normalizePlan(plan)] ?? [];
}

export function hasCapability(plan: AnyPlan, capability: Capability): boolean {
  return getPlanCapabilities(plan).includes(capability);
}

export function isPlanAtLeast(current: AnyPlan, minimum: AnyPlan): boolean {
  return PLAN_HIERARCHY.indexOf(normalizePlan(current)) >= PLAN_HIERARCHY.indexOf(normalizePlan(minimum));
}
