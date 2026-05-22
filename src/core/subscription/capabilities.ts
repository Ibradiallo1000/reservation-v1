import { normalizePlan, type Plan } from "@/core/subscription/plans";

export type ProductCapability =
  | "basic_operations"
  | "financial_advanced"
  | "cash_realtime"
  | "multi_agency_analytics"
  | "fraud_detection"
  | "auto_reports";

export type CompanyCapabilitySource =
  | {
      plan?: unknown;
      planId?: unknown;
    }
  | Plan
  | string
  | null
  | undefined;

export const ALL_PRODUCT_CAPABILITIES: readonly ProductCapability[] = [
  "basic_operations",
  "financial_advanced",
  "cash_realtime",
  "multi_agency_analytics",
  "fraud_detection",
  "auto_reports",
];

const PRODUCT_CAPABILITIES_BY_PLAN: Record<Plan, readonly ProductCapability[]> = {
  standard: ["basic_operations"],
  premium: ALL_PRODUCT_CAPABILITIES,
};

export function getCompanyPlan(company: CompanyCapabilitySource): Plan {
  if (typeof company === "string") return normalizePlan(company);
  if (company && typeof company === "object") {
    return normalizePlan(String(company.plan ?? company.planId ?? ""));
  }
  return "standard";
}

export function getProductCapabilities(company: CompanyCapabilitySource): readonly ProductCapability[] {
  return PRODUCT_CAPABILITIES_BY_PLAN[getCompanyPlan(company)];
}

export function hasCapability(company: CompanyCapabilitySource, capability: ProductCapability): boolean {
  return getProductCapabilities(company).includes(capability);
}
