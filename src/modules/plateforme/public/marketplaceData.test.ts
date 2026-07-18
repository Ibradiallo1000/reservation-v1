import { describe, expect, it } from "vitest";
import { derivePopularRoutes, derivePublicCities, filterPublicCompanies, normalizeSearchToken, suggestPublicCities, validateMarketplaceSearch } from "./marketplaceData";

const trips = [
  { departure: " Ségou ", arrival: "Bamako", companyId: "c1" },
  { departure: "Segou", arrival: "Bamako", companyId: "c1" },
  { departure: "Kayes", arrival: "Bamako", companyId: "c2" },
];

describe("marketplace real-data selectors", () => {
  it("normalizes accents, deduplicates and sorts cities", () => {
    expect(normalizeSearchToken("  SÉGOU ")).toBe("segou");
    expect(derivePublicCities(trips)).toEqual(["Bamako", "Kayes", "Ségou"]);
  });
  it("normalizes apostrophes, hyphens and repeated spaces", () => {
    expect(normalizeSearchToken("  N’Zi-Comoé  ")).toBe("n zi comoe");
  });
  it("prioritizes prefix matches before content matches", () => {
    expect(suggestPublicCities(["Abidjan", "Bamako", "Bouaké", "Bobo-Dioulasso"], "b"))
      .toEqual(["Bamako", "Bobo-Dioulasso", "Bouaké", "Abidjan"]);
    expect(suggestPublicCities(["Bamako"], "z")).toEqual([]);
  });

  it("ranks routes by observed active-trip frequency and applies the limit", () => {
    expect(derivePopularRoutes(trips, 1)).toEqual([{ departure: "Ségou", arrival: "Bamako", tripCount: 2 }]);
    expect(derivePopularRoutes([], 8)).toEqual([]);
  });

  it("keeps only active published companies with a usable slug", () => {
    const companies = filterPublicCompanies([
      { id: "c1", nom: "Alpha", slug: "alpha", status: "actif", publicPageEnabled: true, logoUrl: "https://img.test/a.png", privateEmail: "hidden@test" },
      { id: "c2", nom: "Inactive", slug: "inactive", status: "inactif", publicPageEnabled: true },
      { id: "c3", nom: "Private", slug: "private", status: "actif", publicPageEnabled: false },
      { id: "c4", nom: "No slug", status: "actif", publicPageEnabled: true },
    ], trips);
    expect(companies).toEqual([{ name: "Alpha", slug: "alpha", logoUrl: "https://img.test/a.png", description: undefined, tripCount: 2 }]);
    expect(companies[0]).not.toHaveProperty("privateEmail");
  });
  it("keeps a published partner without trips and projects its existing country", () => {
    expect(filterPublicCompanies([{ id: "c5", nom: "Beta", slug: "beta", status: "actif", publicPageEnabled: true, pays: "Côte d’Ivoire" }], []))
      .toEqual([{ name: "Beta", slug: "beta", description: undefined, logoUrl: undefined, tripCount: 0, country: "Côte d’Ivoire" }]);
  });
});

describe("marketplace search validation", () => {
  const today = "2026-07-18";
  it("requires departure, arrival and date", () => {
    expect(validateMarketplaceSearch("", "", "", today)).toEqual({ departure: expect.any(String), arrival: expect.any(String), date: expect.any(String) });
  });
  it("rejects equal cities, past dates and impossible dates", () => {
    expect(validateMarketplaceSearch("Ségou", "segou", today, today).arrival).toBeTruthy();
    expect(validateMarketplaceSearch("A", "B", "2026-07-17", today).date).toBeTruthy();
    expect(validateMarketplaceSearch("A", "B", "2026-02-31", today).date).toBeTruthy();
  });
  it("accepts a complete valid search", () => {
    expect(validateMarketplaceSearch("A", "B", "2026-07-20", today)).toEqual({});
  });
  it("rejects typed free text that was not resolved to a public city", () => {
    expect(validateMarketplaceSearch("Ville inventée", "Ségou", "2026-07-20", today, ["Bamako", "Ségou"]).departure).toBe("Sélectionnez une ville dans la liste.");
  });
});
