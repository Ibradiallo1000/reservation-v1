// src/core/permissions/capabilities.ts
// Defines the atomic units of authorization in the Teliya Transport SaaS.
// Each capability represents a single, testable action or feature access.

export type Capability =
  | "view_global_dashboard"
  | "view_agency_dashboard"
  | "manage_treasury"
  | "manage_multi_bank"
  | "validate_sessions"
  | "manage_company_finances"
  | "manage_agency_finances"
  | "manage_global_fleet"
  | "manage_agency_fleet"
  | "view_profit_analysis"
  | "manage_roles"
  | "access_enterprise_features"
  | "manage_reservations"
  | "manage_guichet"
  | "manage_boarding"
  | "manage_personnel"
  | "manage_company_settings"
  | "view_company_stats"
  | "view_agency_stats"
  | "manage_agency_trajets"
  | "view_anomaly_engine"
  | "view_predictive_insights"
  | "use_simulation_engine"
  | "manage_logistics";

export const ALL_CAPABILITIES: Capability[] = [
  "view_global_dashboard",
  "view_agency_dashboard",
  "manage_treasury",
  "manage_multi_bank",
  "validate_sessions",
  "manage_company_finances",
  "manage_agency_finances",
  "manage_global_fleet",
  "manage_agency_fleet",
  "view_profit_analysis",
  "manage_roles",
  "access_enterprise_features",
  "manage_reservations",
  "manage_guichet",
  "manage_boarding",
  "manage_personnel",
  "manage_company_settings",
  "view_company_stats",
  "view_agency_stats",
  "manage_agency_trajets",
  "view_anomaly_engine",
  "view_predictive_insights",
  "use_simulation_engine",
  "manage_logistics",
];
