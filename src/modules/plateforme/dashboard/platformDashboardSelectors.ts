import type { AdminCompanyRecord } from "../pages/adminBusinessUtils";
import { getCompanyPlanConfig, getCompanyUsageRatio, isCompanyBillable } from "../pages/adminBusinessUtils";
import type { SystemPlansConfig } from "../pages/systemPlansConfig";

export type PlatformSubscriptionRequest = { id: string; companyId: string; status: string };

export function selectPlatformDashboard(
  companies: readonly AdminCompanyRecord[],
  plans: SystemPlansConfig,
  requests: readonly PlatformSubscriptionRequest[],
) {
  const activeCompanies = companies.filter((company) => company.status.toLowerCase() !== "inactif");
  const inactiveCompanies = companies.filter((company) => company.status.toLowerCase() === "inactif");
  const premiumCompanies = companies.filter((company) => company.plan === "premium");
  const totalOperations = companies.reduce((sum, company) => sum + company.currentMonthOperations, 0);
  const mrr = companies
    .filter(isCompanyBillable)
    .reduce((sum, company) => sum + getCompanyPlanConfig(plans, company.plan).price, 0);
  const pendingRequests = requests.filter((request) => request.status === "pending").length;
  const companiesNearLimit = companies
    .filter((company) => getCompanyUsageRatio(company, plans) >= 0.8)
    .sort((a, b) => b.currentMonthOperations - a.currentMonthOperations);

  return {
    totalCompanies: companies.length,
    activeCompanies: activeCompanies.length,
    inactiveCompanies,
    premiumCompanies: premiumCompanies.length,
    totalOperations,
    mrr,
    pendingRequests,
    companiesNearLimit,
    companiesByUsage: [...companies].sort((a, b) => b.currentMonthOperations - a.currentMonthOperations).slice(0, 6),
    recentCompanies: [...companies]
      .filter((company) => company.createdAt)
      .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
      .slice(0, 5),
  };
}
