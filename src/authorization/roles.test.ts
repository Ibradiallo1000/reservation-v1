import { describe, expect, it } from "vitest";
import { normalizeRole, normalizeRoles } from "./roles";

describe("normalizeRole", () => {
  it("preserves a canonical role", () => expect(normalizeRole("chefAgence")).toBe("chefAgence"));
  it("normalizes admin_company", () => expect(normalizeRole("admin_company")).toBe("admin_compagnie"));
  it("normalizes chefagence", () => expect(normalizeRole("chefagence")).toBe("chefAgence"));
  it("does not grant a role to unknown, empty, or non-text values", () => {
    expect(normalizeRole("unknown_role")).toBeNull();
    expect(normalizeRole(" ")).toBeNull();
    expect(normalizeRole(42)).toBeNull();
    expect(normalizeRole(null)).toBeNull();
  });
  it("deduplicates normalized role arrays", () => {
    expect(normalizeRoles(["admin_company", "admin_compagnie", "unknown"])).toEqual(["admin_compagnie"]);
  });
});
