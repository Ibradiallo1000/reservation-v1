import { describe, expect, it } from "vitest";
import { authorizeRoute, ROUTE_AUTHORIZATIONS } from "./routeAuthorization";

const context = { companyId: "company-1", agencyId: "agency-1" };

describe("route authorization", () => {
  it("allows a canonical treasury route only for the agency accountant", () => {
    expect(authorizeRoute("agencyTreasury", "agency_accountant", context)).toBe("allowed");
    expect(authorizeRoute("agencyTreasury", "chefAgence", context)).toBe("forbidden");
  });
  it("gives the legacy treasury alias exactly the canonical authorization", () => {
    expect(ROUTE_AUTHORIZATIONS.legacyAgencyTreasury.requiredCapability).toBe(ROUTE_AUTHORIZATIONS.agencyTreasury.requiredCapability);
    expect(ROUTE_AUTHORIZATIONS.legacyAgencyTreasury.context).toBe(ROUTE_AUTHORIZATIONS.agencyTreasury.context);
    expect(authorizeRoute("legacyAgencyTreasury", "agency_accountant", context)).toBe(authorizeRoute("agencyTreasury", "agency_accountant", context));
    expect(authorizeRoute("legacyAgencyTreasury", "chefAgence", context)).toBe(authorizeRoute("agencyTreasury", "chefAgence", context));
  });
  it("reports missing contexts before evaluating route capability", () => {
    expect(authorizeRoute("companyCommand", "admin_compagnie", {})).toBe("missing_company");
    expect(authorizeRoute("counter", "guichetier", { companyId: "company-1" })).toBe("missing_agency");
  });
  it("reports a disabled feature explicitly", () => {
    expect(authorizeRoute("fleet", "agency_fleet_controller", context)).toBe("feature_unavailable");
  });
});
