import { describe, expect, it } from "vitest";
import { deriveMarketplaceCountries, filterMarketplaceByCountry, filterPublicCompanies } from "./marketplaceData";

const raw = [
  { id: "m", nom: "Mali Bus", slug: "mali-bus", status: "actif", publicPageEnabled: true, pays: "Mali" },
  { id: "s", nom: "Sénégal Bus", slug: "senegal-bus", status: "actif", publicPageEnabled: true, countryCode: "SN" },
];
const trips = [
  { companyId: "m", departure: "Bamako", arrival: "Ségou" },
  { companyId: "s", departure: "Dakar", arrival: "Thiès" },
];

describe("multi-country Marketplace", () => {
  it("does not require a selector for a single recognized country", () => {
    expect(deriveMarketplaceCountries(filterPublicCompanies(raw.slice(0, 1), trips))).toEqual(["ML"]);
  });
  it("derives multiple countries and filters partners, trips and therefore cities", () => {
    const companies = filterPublicCompanies(raw, trips);
    expect(deriveMarketplaceCountries(companies)).toEqual(["ML", "SN"]);
    const filtered = filterMarketplaceByCountry(companies, trips, "SN");
    expect(filtered.companies.map((company) => company.slug)).toEqual(["senegal-bus"]);
    expect(filtered.trips).toEqual([trips[1]]);
  });
  it("keeps all public data when no country is selected", () => {
    const companies = filterPublicCompanies(raw, trips);
    expect(filterMarketplaceByCountry(companies, trips, null)).toEqual({ companies, trips });
  });
});
