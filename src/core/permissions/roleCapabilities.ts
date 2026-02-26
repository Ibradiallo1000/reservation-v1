// src/core/permissions/roleCapabilities.ts
// Maps each Role to its intrinsic capabilities.
// These represent what the role CAN do; the plan further restricts what is UNLOCKED.

import type { Role } from "@/roles-permissions";
import type { Capability } from "./capabilities";
import { ALL_CAPABILITIES } from "./capabilities";

const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  admin_platforme: ALL_CAPABILITIES,

  admin_compagnie: [
    "view_global_dashboard",
    "manage_company_finances",
    "manage_global_fleet",
    "manage_roles",
    "manage_treasury",
    "manage_multi_bank",
    "validate_sessions",
    "view_profit_analysis",
    "view_anomaly_engine",
    "view_predictive_insights",
    "use_simulation_engine",
    "manage_reservations",
    "manage_personnel",
    "manage_company_settings",
    "view_company_stats",
    "access_enterprise_features",
    "manage_logistics",
  ],

  financial_director: [
    "view_global_dashboard",
    "manage_company_finances",
    "manage_treasury",
    "manage_multi_bank",
    "validate_sessions",
    "view_profit_analysis",
    "view_anomaly_engine",
    "view_predictive_insights",
    "use_simulation_engine",
    "view_company_stats",
  ],

  company_accountant: [
    "manage_company_finances",
    "manage_treasury",
    "validate_sessions",
    "view_company_stats",
  ],

  chef_garage: [
    "manage_global_fleet",
    "view_company_stats",
  ],

  chefAgence: [
    "view_agency_dashboard",
    "manage_agency_finances",
    "manage_agency_fleet",
    "manage_reservations",
    "manage_guichet",
    "manage_boarding",
    "manage_personnel",
    "manage_agency_trajets",
    "view_agency_stats",
    "manage_logistics",
  ],

  superviseur: [
    "view_agency_dashboard",
    "manage_agency_finances",
    "manage_reservations",
    "manage_guichet",
    "manage_boarding",
    "manage_agency_fleet",
    "manage_personnel",
    "view_agency_stats",
  ],

  agentCourrier: [
    "view_agency_dashboard",
    "manage_reservations",
    "manage_logistics",
  ],

  agency_accountant: [
    "manage_agency_finances",
    "view_agency_stats",
  ],

  guichetier: [
    "manage_guichet",
    "manage_reservations",
  ],

  chefEmbarquement: [
    "manage_boarding",
    "manage_reservations",
  ],

  agency_fleet_controller: [
    "manage_agency_fleet",
  ],

  unauthenticated: [],
  user: [],
};

export function getRoleCapabilities(role: Role): readonly Capability[] {
  return ROLE_CAPABILITIES[role] ?? [];
}
