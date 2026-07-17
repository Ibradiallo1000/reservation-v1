import { describe, expect, it } from "vitest";
import { mergeAdminPlansConfig, type AdminCompanyRecord } from "../pages/adminBusinessUtils";
import { selectPlatformDashboard } from "./platformDashboardSelectors";

const company = (overrides: Partial<AdminCompanyRecord>): AdminCompanyRecord => ({
  id: "company-1", name: "Compagnie test", slug: "compagnie-test", email: "hidden@example.test",
  telephone: "000", pays: "ML", status: "actif", plan: "standard", subscriptionStatus: "active",
  currentMonthOperations: 10, totalPaymentsReceived: 0, createdAt: new Date("2026-01-01"),
  updatedAt: null, lastPaymentAt: null, nextBillingDate: null, ...overrides,
});

describe("selectPlatformDashboard", () => {
  it("derives real platform totals without exposing personal fields", () => {
    const result = selectPlatformDashboard(
      [company({}), company({ id: "company-2", status: "inactif", currentMonthOperations: 20 })],
      mergeAdminPlansConfig(null),
      [{ id: "request-1", companyId: "company-1", status: "pending" }],
    );
    expect(result.totalCompanies).toBe(2);
    expect(result.activeCompanies).toBe(1);
    expect(result.inactiveCompanies).toHaveLength(1);
    expect(result.pendingRequests).toBe(1);
    expect(result).not.toHaveProperty("email");
  });

  it("handles an empty platform without invented entities", () => {
    const result = selectPlatformDashboard([], mergeAdminPlansConfig(null), []);
    expect(result.totalCompanies).toBe(0);
    expect(result.companiesByUsage).toEqual([]);
    expect(result.recentCompanies).toEqual([]);
  });
});
