import { describe, expect, it } from "vitest";
import { hasCapability, ROLE_CAPABILITIES } from "./capabilities";

describe("role capabilities", () => {
  it("keeps the CEO out of accounting operations and agency treasury mutations", () => {
    expect(hasCapability("admin_compagnie", "company.accounting.operate")).toBe(false);
    expect(hasCapability("admin_compagnie", "agency.treasury.mutate")).toBe(false);
    expect(hasCapability("admin_compagnie", "counter.sell")).toBe(false);
  });
  it("gives confirmed company finance capabilities to company accountants", () => {
    expect(hasCapability("company_accountant", "company.accounting.view")).toBe(true);
    expect(hasCapability("company_accountant", "company.accounting.operate")).toBe(true);
  });
  it("does not grant unproved accounting mutation to an agency manager", () => {
    expect(hasCapability("chefAgence", "agency.treasury.mutate")).toBe(false);
    expect(hasCapability("chefAgence", "agency.accounting.validate")).toBe(false);
    expect(hasCapability("chefAgence", "counter.sell")).toBe(false);
  });
  it("preserves agency accountant validation and treasury capabilities", () => {
    expect(hasCapability("agency_accountant", "agency.accounting.validate")).toBe(true);
    expect(hasCapability("agency_accountant", "agency.treasury.mutate")).toBe(true);
  });
  it("keeps counter and courier roles within their specialist spaces", () => {
    expect(hasCapability("guichetier", "agency.accounting.view")).toBe(false);
    expect(ROLE_CAPABILITIES.agentCourrier).toEqual(["courier.manage"]);
  });
  it("recognizes the deferred fleet role without activating other capabilities", () => {
    expect(ROLE_CAPABILITIES.agency_fleet_controller).toEqual(["fleet.view"]);
  });
});
