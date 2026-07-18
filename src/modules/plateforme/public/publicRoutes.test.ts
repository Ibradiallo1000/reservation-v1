import { describe, expect, it } from "vitest";
import {
  buildCompanyResultsRoute,
  buildLegacyCompanyResultsRoute,
  buildLegacyReservationRoute,
  buildMarketplaceResultsRoute,
} from "./publicRoutes";

describe("public route architecture", () => {
  it("builds the canonical marketplace search and keeps the date", () => {
    expect(buildMarketplaceResultsRoute({ departure: "Bamako", arrival: "Ségou", date: "2026-07-17" }))
      .toBe("/resultats?from=Bamako&to=S%C3%A9gou&date=2026-07-17");
  });

  it("builds a company result route without asking for the criteria again", () => {
    expect(buildCompanyResultsRoute("nila-toulel", { departure: "Bamako", arrival: "Kayes", date: "2026-07-17" }))
      .toBe("/compagnie/nila-toulel/resultats?departure=Bamako&arrival=Kayes&date=2026-07-17");
  });

  it("maps the company result alias to the existing tenant route", () => {
    expect(buildLegacyCompanyResultsRoute("mali-trans", "?departure=Bamako&arrival=Kayes"))
      .toBe("/mali-trans/resultats?departure=Bamako&arrival=Kayes");
  });

  it("requires an explicit company context for the reservation entry", () => {
    expect(buildLegacyReservationRoute("?slug=mali-trans&departure=Bamako"))
      .toBe("/mali-trans/booking?departure=Bamako");
    expect(buildLegacyReservationRoute("?departure=Bamako")).toBeNull();
  });
});
