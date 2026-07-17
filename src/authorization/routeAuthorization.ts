import { ENABLE_FLEET, ENABLE_LOGISTICS } from "@/config/featureFlags";
import type { AppCapability } from "./capabilities";
import { hasCapability } from "./capabilities";
import type { CanonicalRole } from "./roles";
import type { AppSpace, RequiredContext } from "./spaces";
import type { AuthorizationContext } from "./defaultRoute";

export interface RouteAuthorization {
  routeId: string;
  path: string;
  canonicalPath?: string;
  space: AppSpace;
  requiredCapability: AppCapability;
  context: RequiredContext;
  featureActive?: boolean;
}

export const ROUTE_AUTHORIZATIONS = {
  platform: { routeId: "platform", path: "/admin/*", space: "PLATFORM", requiredCapability: "platform.view", context: "none" },
  companyCommand: { routeId: "company-command", path: "/compagnie/:companyId/*", space: "COMPANY_COMMAND", requiredCapability: "company.command.view", context: "company" },
  companyAccounting: { routeId: "company-accounting", path: "/compagnie/:companyId/accounting/*", space: "COMPANY_ACCOUNTING", requiredCapability: "company.accounting.view", context: "company" },
  digitalCash: { routeId: "digital-cash", path: "/compagnie/:companyId/digital-cash", space: "COMPANY_ACCOUNTING", requiredCapability: "company.digital-payments.manage", context: "company" },
  agency: { routeId: "agency", path: "/agence/*", space: "AGENCY", requiredCapability: "agency.dashboard.view", context: "agency" },
  agencyAccounting: { routeId: "agency-accounting", path: "/agence/comptabilite*", space: "AGENCY_ACCOUNTING", requiredCapability: "agency.accounting.view", context: "agency" },
  agencyTreasury: { routeId: "agency-treasury", path: "/agence/comptabilite/treasury/*", canonicalPath: "/agence/comptabilite/treasury/*", space: "AGENCY_ACCOUNTING", requiredCapability: "agency.treasury.mutate", context: "agency" },
  legacyAgencyTreasury: { routeId: "legacy-agency-treasury", path: "/agence/treasury/new-*", canonicalPath: "/agence/comptabilite/treasury/*", space: "AGENCY_ACCOUNTING", requiredCapability: "agency.treasury.mutate", context: "agency" },
  counter: { routeId: "counter", path: "/agence/guichet", space: "COUNTER", requiredCapability: "counter.sell", context: "agency" },
  boarding: { routeId: "boarding", path: "/agence/boarding/*", space: "BOARDING", requiredCapability: "boarding.manage", context: "agency" },
  courier: { routeId: "courier", path: "/agence/courrier/*", space: "COURIER", requiredCapability: "courier.manage", context: "agency" },
  escale: { routeId: "escale", path: "/agence/escale/*", space: "ESCALE", requiredCapability: "escale.manage", context: "agency" },
  fleet: { routeId: "fleet", path: "/agence/fleet/*", space: "AGENCY", requiredCapability: "fleet.view", context: "agency", featureActive: ENABLE_FLEET },
  logistics: { routeId: "logistics", path: "/compagnie/:companyId/garage/*", space: "COMPANY_COMMAND", requiredCapability: "company.logistics.view", context: "company", featureActive: ENABLE_LOGISTICS },
} as const satisfies Record<string, RouteAuthorization>;

export type RouteAuthorizationId = keyof typeof ROUTE_AUTHORIZATIONS;
export type RouteDecision = "allowed" | "forbidden" | "missing_company" | "missing_agency" | "feature_unavailable";

export function authorizeRoute(
  routeId: RouteAuthorizationId,
  role: CanonicalRole,
  context: AuthorizationContext,
): RouteDecision {
  const route = ROUTE_AUTHORIZATIONS[routeId];
  if ("featureActive" in route && route.featureActive === false) return "feature_unavailable";
  if (route.context === "company" && !context.companyId?.trim()) return "missing_company";
  if (route.context === "agency") {
    if (!context.companyId?.trim()) return "missing_company";
    if (!context.agencyId?.trim()) return "missing_agency";
  }
  return hasCapability(role, route.requiredCapability) ? "allowed" : "forbidden";
}
