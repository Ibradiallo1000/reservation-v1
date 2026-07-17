import { describe, expect, it } from "vitest";
import type { AgencyLiveTripItem } from "@/modules/agence/manager/domains/useAgencyActionCockpit";
import {
  AGENCY_TODAY_ALIASES,
  AGENCY_TODAY_CANONICAL_ROUTE,
  getAgencyQuickAccess,
  resolveAgencyTodayAccess,
  selectTodayDepartures,
} from "./agencyTodaySelectors";

const trip = (overrides: Partial<AgencyLiveTripItem>): AgencyLiveTripItem => ({
  id: "trip-1", tripInstanceId: "instance-1", routeLabel: "Bamako — Ségou", departureTime: "08:00",
  reservedSeats: 12, capacity: 40, fillRate: 0.3, tone: "healthy", needsValidation: false,
  isLate: false, statusLabel: "Prévu", estimatedLoss: 0, ...overrides,
});

describe("agency today selectors", () => {
  it("keeps the Today canonical route and historical aliases", () => {
    expect(AGENCY_TODAY_CANONICAL_ROUTE).toBe("/agence/activite");
    expect(AGENCY_TODAY_ALIASES).toContain("/agence/dashboard");
    expect(AGENCY_TODAY_ALIASES).toContain("/agence/operations");
  });

  it("sorts several departures and marks a proven delay", () => {
    const rows = selectTodayDepartures([trip({ id: "late", departureTime: "10:00", isLate: true }), trip({ id: "early", departureTime: "07:00" })]);
    expect(rows.map((row) => row.id)).toEqual(["early", "late"]);
    expect(rows[1].attention).toBe(true);
  });

  it("does not mark a confirmed delayed departure as requiring attention", () => {
    expect(selectTodayDepartures([trip({ isLate: true, departureConfirmed: true })])[0].attention).toBe(false);
  });

  it("only exposes canonical links allowed by existing capabilities", () => {
    const links = getAgencyQuickAccess("chefAgence");
    expect(links.map((link) => link.to)).toEqual(["/agence/validation-departs", "/agence/caisse", "/agence/team", "/agence/trajets"]);
    expect(links.some((link) => link.to.includes("treasury"))).toBe(false);
    expect(links.some((link) => link.to === "/agence/guichet")).toBe(false);
  });

  it("requires the real company and agency context before loading", () => {
    expect(resolveAgencyTodayAccess("chefAgence", "company-1", "agency-1")).toBe("allowed");
    expect(resolveAgencyTodayAccess("chefAgence", "company-1", "")).toBe("missing_agency");
    expect(resolveAgencyTodayAccess("chefAgence", "", "agency-1")).toBe("missing_company");
    expect(resolveAgencyTodayAccess(null, "company-1", "agency-1")).toBe("unknown_role");
    expect(resolveAgencyTodayAccess("guichetier", "company-1", "agency-1")).toBe("forbidden");
  });

  it("keeps the supervisor quick access limited to confirmed capabilities", () => {
    const links = getAgencyQuickAccess("superviseur");
    expect(links.some((link) => link.to === "/agence/guichet")).toBe(false);
    expect(links.some((link) => link.to === "/agence/boarding")).toBe(false);
    expect(links.some((link) => link.to === "/agence/courrier")).toBe(false);
  });
});
