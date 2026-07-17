import { ENABLE_FLEET, ENABLE_LOGISTICS } from "@/config/featureFlags";
import type { CanonicalRole } from "./roles";

export interface AuthorizationContext {
  companyId?: string | null;
  agencyId?: string | null;
}

export type DefaultRouteResult =
  | { status: "ok"; route: string }
  | { status: "missing_company" }
  | { status: "missing_agency" }
  | { status: "feature_unavailable"; feature: "fleet" | "logistics" };

const clean = (value?: string | null) => value?.trim() || null;

export function getDefaultRouteForRole(
  role: CanonicalRole,
  context: AuthorizationContext,
): DefaultRouteResult {
  const companyId = clean(context.companyId);
  const agencyId = clean(context.agencyId);
  switch (role) {
    case "admin_platforme": return { status: "ok", route: "/admin/dashboard" };
    case "admin_compagnie": return companyId ? { status: "ok", route: `/compagnie/${companyId}/command-center` } : { status: "missing_company" };
    case "financial_director":
    case "company_accountant": return companyId ? { status: "ok", route: `/compagnie/${companyId}/accounting` } : { status: "missing_company" };
    case "operator_digital": return companyId ? { status: "ok", route: `/compagnie/${companyId}/digital-cash` } : { status: "missing_company" };
    case "responsable_logistique":
      if (!ENABLE_LOGISTICS) return { status: "feature_unavailable", feature: "logistics" };
      return companyId ? { status: "ok", route: `/compagnie/${companyId}/garage/dashboard` } : { status: "missing_company" };
    case "agency_fleet_controller":
      if (!ENABLE_FLEET) return { status: "feature_unavailable", feature: "fleet" };
      return companyId && agencyId ? { status: "ok", route: "/agence/fleet" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
    case "agency_accountant": return companyId && agencyId ? { status: "ok", route: "/agence/comptabilite" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
    case "guichetier": return companyId && agencyId ? { status: "ok", route: "/agence/guichet" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
    case "chefEmbarquement": return companyId && agencyId ? { status: "ok", route: "/agence/boarding" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
    case "agentCourrier": return companyId && agencyId ? { status: "ok", route: "/agence/courrier" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
    case "escale_agent":
    case "escale_manager": return companyId && agencyId ? { status: "ok", route: "/agence/escale" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
    case "chefAgence":
    case "superviseur": return companyId && agencyId ? { status: "ok", route: "/agence/activite" } : !companyId ? { status: "missing_company" } : { status: "missing_agency" };
  }
}
