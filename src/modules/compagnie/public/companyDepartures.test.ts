import { describe, expect, it } from "vitest";
import { publicDepartureHasPassed } from "@/modules/compagnie/tripInstances/publicValidTripsService";
import { buildBookingHandoff, selectCompanyDepartures, sortCompanyDepartures, validateCompanyDepartureCriteria } from "./companyDepartures";

const criteria = { from: "Bamako", to: "Ségou", date: "2026-07-20" };
const base = { id: "w1_2026-07-20_08-00", weeklyTripId: "w1", date: criteria.date, time: "08:00", departure: "Bamako", arrival: "Segou", price: 5000, remainingSeats: 12, agencyId: "agency-private" };

describe("company departure criteria", () => {
  it("validates required values, distinct cities and date", () => {
    expect(validateCompanyDepartureCriteria({ from: "", to: "", date: "" }, "2026-07-18")).toHaveProperty("from");
    expect(validateCompanyDepartureCriteria({ from: "Ségou", to: "segou", date: criteria.date }, "2026-07-18")).toHaveProperty("to");
    expect(validateCompanyDepartureCriteria(criteria, "2026-07-18")).toEqual({});
  });
});

describe("company departure selection", () => {
  it("keeps exact-date exact-route trips, deduplicates and prioritizes the supplied normalized offer", () => {
    const rows = selectCompanyDepartures([base, { ...base }, { ...base, id: "other", date: "2026-07-21" }], criteria);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ price: 5000, availabilityStatus: "confirmed" });
  });
  it("marks reliable zero seats unavailable and unknown seats unknown", () => {
    expect(selectCompanyDepartures([{ ...base, remainingSeats: 0 }], criteria)[0].availabilityStatus).toBe("unavailable");
    expect(selectCompanyDepartures([{ ...base, remainingSeats: Number.NaN }], criteria)[0].availabilityStatus).toBe("unknown");
  });
  it("sorts by time or known price with unavailable prices last", () => {
    const rows = selectCompanyDepartures([{ ...base, id: "a", weeklyTripId: "a", time: "10:00", price: 3000 }, { ...base, id: "b", weeklyTripId: "b", time: "09:00", price: 0 }], criteria);
    expect(sortCompanyDepartures(rows, "time")[0].time).toBe("09:00");
    expect(sortCompanyDepartures(rows, "price")[0].price).toBe(3000);
  });
});

describe("booking handoff", () => {
  it("preserves public criteria and keeps technical identifiers out of the URL", () => {
    const departure = selectCompanyDepartures([base], criteria)[0];
    const handoff = buildBookingHandoff({ slug: "transport test", pathBase: "transport test", departure, company: { id: "company-private", nom: "Transport Test" } });
    expect(handoff.route).toBe("/transport%20test/booking?departure=Bamako&arrival=Segou&date=2026-07-20&time=08%3A00");
    expect(handoff.route).not.toContain("company-private");
    expect(handoff.route).not.toContain("agency-private");
    expect(handoff.state.tripData).toMatchObject({ id: base.id, companyId: "company-private", agenceId: "agency-private", price: 5000 });
  });
});

describe("agency timezone", () => {
  it("does not use the browser timezone to decide whether a same-day departure passed", () => {
    const now = new Date("2026-07-20T08:30:00Z");
    expect(publicDepartureHasPassed("2026-07-20", "09:00", "Africa/Bamako", now)).toBe(false);
    expect(publicDepartureHasPassed("2026-07-20", "09:00", "Africa/Nairobi", now)).toBe(true);
  });
  it("handles midnight and date boundaries", () => {
    expect(publicDepartureHasPassed("2026-07-21", "00:15", "Africa/Bamako", new Date("2026-07-20T23:30:00Z"))).toBe(false);
  });
});
