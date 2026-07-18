import { describe, expect, it } from "vitest";
import { buildCountryBackfillPlan, resolveCompanyCountryCode } from "./supportedCountries";

describe("country normalization", () => {
  it.each([["ML", "ML"], ["ml", "ML"], ["Mali", "ML"], ["Sénégal", "SN"], ["Senegal", "SN"], ["Côte d’Ivoire", "CI"], ["Ivory Coast", "CI"]])("resolves %s", (raw, expected) => {
    expect(resolveCompanyCountryCode({ pays: raw })).toBe(expected);
  });
  it("prioritizes a valid canonical value", () => expect(resolveCompanyCountryCode({ countryCode: "SN", pays: "Mali" })).toBe("SN"));
  it.each([undefined, "", "Atlantide", 42])("does not guess %s", (raw) => expect(resolveCompanyCountryCode({ pays: raw })).toBeNull());
});

describe("country backfill dry-run", () => {
  it("only proposes the missing canonical field and is idempotent", () => {
    const first = buildCountryBackfillPlan([{ id: "a", pays: "Mali", devise: "XOF" }, { id: "b", countryCode: "SN", pays: "Sénégal" }, { id: "c", pays: "?" }]);
    expect(first).toEqual([
      { companyId: "a", status: "proposed", countryCode: "ML", patch: { countryCode: "ML" } },
      { companyId: "b", status: "already-canonical", countryCode: "SN", patch: null },
      { companyId: "c", status: "unresolved", countryCode: null, patch: null },
    ]);
    expect(Object.keys(first[0].patch!)).toEqual(["countryCode"]);
    expect(buildCountryBackfillPlan([{ id: "a", countryCode: first[0].countryCode, pays: "Mali" }])[0].status).toBe("already-canonical");
  });
});
