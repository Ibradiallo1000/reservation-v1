import { describe, expect, it } from "vitest";
import { diagnoseCompanyCountry } from "./countryDiagnostics";

describe("non-public country diagnostics", () => {
  it("classifies historical, missing and contradictory records without mutation", () => {
    const source = { id: "c1", pays: "République du Mali", devise: "EUR" };
    expect(diagnoseCompanyCountry(source, [{ pays: "Sénégal" }])).toEqual({
      companyId: "c1", status: "historical-resolvable", resolvedCountryCode: "ML",
      anomalies: ["agency-country-contradiction", "currency-contradiction", "timezone-missing"],
    });
    expect(source).toEqual({ id: "c1", pays: "République du Mali", devise: "EUR" });
    expect(diagnoseCompanyCountry({ id: "c2" }).status).toBe("missing");
    expect(diagnoseCompanyCountry({ id: "c3", pays: "Congo" }).status).toBe("ambiguous-or-unknown");
  });
});
