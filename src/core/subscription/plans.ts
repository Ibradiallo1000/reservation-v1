// src/core/subscription/plans.ts
// Defines subscription plans and their unlocked capabilities.
// Plans control WHAT features are available; roles control WHO can use them.

import type { Capability } from "@/core/permissions/capabilities";

export type Plan = "starter" | "growth" | "enterprise";

const STARTER_CAPABILITIES: readonly Capability[] = [
  "view_agency_dashboard",
  "manage_agency_finances",
  "manage_reservations",
  "manage_guichet",
  "manage_boarding",
  "manage_agency_fleet",
  "manage_personnel",
  "manage_agency_trajets",
  "view_agency_stats",
];

const GROWTH_CAPABILITIES: readonly Capability[] = [
  ...STARTER_CAPABILITIES,
  "manage_treasury",
  "manage_multi_bank",
  "view_global_dashboard",
  "manage_company_finances",
  "validate_sessions",
  "manage_global_fleet",
  "manage_roles",
  "manage_company_settings",
  "view_company_stats",
  "view_profit_analysis",
  "view_anomaly_engine",
];

const ENTERPRISE_CAPABILITIES: readonly Capability[] = [
  ...GROWTH_CAPABILITIES,
  "view_predictive_insights",
  "use_simulation_engine",
  "access_enterprise_features",
];

const PLAN_CAPABILITIES: Record<Plan, readonly Capability[]> = {
  starter: STARTER_CAPABILITIES,
  growth: GROWTH_CAPABILITIES,
  enterprise: ENTERPRISE_CAPABILITIES,
};

export const PLAN_HIERARCHY: readonly Plan[] = ["starter", "growth", "enterprise"];

export function getPlanCapabilities(plan: Plan): readonly Capability[] {
  return PLAN_CAPABILITIES[plan] ?? [];
}

export function isPlanAtLeast(current: Plan, minimum: Plan): boolean {
  return PLAN_HIERARCHY.indexOf(current) >= PLAN_HIERARCHY.indexOf(minimum);
}
