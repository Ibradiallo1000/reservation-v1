import { describe, expect, it } from "vitest";
import { getDefaultRouteForRole } from "./defaultRoute";

const context = { companyId: "company-1", agencyId: "agency-1" };

describe("getDefaultRouteForRole", () => {
  it("returns canonical, non-mutating home routes", () => {
    expect(getDefaultRouteForRole("admin_platforme", context)).toEqual({ status: "ok", route: "/admin/dashboard" });
    expect(getDefaultRouteForRole("admin_compagnie", context)).toEqual({ status: "ok", route: "/compagnie/company-1/command-center" });
    expect(getDefaultRouteForRole("agency_accountant", context)).toEqual({ status: "ok", route: "/agence/comptabilite" });
    expect(getDefaultRouteForRole("guichetier", context)).toEqual({ status: "ok", route: "/agence/guichet" });
  });
  it("reports missing company and agency contexts explicitly", () => {
    expect(getDefaultRouteForRole("admin_compagnie", {})).toEqual({ status: "missing_company" });
    expect(getDefaultRouteForRole("chefAgence", { companyId: "company-1" })).toEqual({ status: "missing_agency" });
  });
  it("does not redirect a deferred role into another space", () => {
    expect(getDefaultRouteForRole("agency_fleet_controller", context).status).toBe("feature_unavailable");
  });
  it("never returns the role landing resolver as a destination", () => {
    for (const role of ["admin_platforme", "admin_compagnie", "chefAgence", "guichetier"] as const) {
      const result = getDefaultRouteForRole(role, context);
      if (result.status === "ok") expect(result.route).not.toBe("/role-landing");
    }
  });
});
