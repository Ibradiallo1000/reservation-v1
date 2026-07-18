import { describe, expect, it } from "vitest";
import { findSelectedTrip, parseBookingSelection, selectionFromUrl, selectionPriceChanged } from "./bookingSelection";

const trips = [
  { id: "instance-1", weeklyTripId: "template-1", agencyId: "agency-1", departure: "Bamako", arrival: "Ségou", date: "2026-07-20", time: "08:00", price: 5000 },
  { id: "instance-2", weeklyTripId: "template-2", agencyId: "agency-1", departure: "Bamako", arrival: "Ségou", date: "2026-07-20", time: "10:00", price: 6000 },
];

describe("public booking selection restoration", () => {
  it("accepts the Phase 7.4 location state contract", () => {
    expect(parseBookingSelection({ slug: "mali-trans", id: "instance-2", agenceId: "agency-1", departure: "Bamako", arrival: "Ségou", date: "2026-07-20", time: "10:00", price: 6000 }))
      .toMatchObject({ companySlug: "mali-trans", tripId: "instance-2", agencyId: "agency-1" });
  });
  it("restores the exact state/cache trip before using public criteria", () => {
    const selection = parseBookingSelection({ companySlug: "mali-trans", id: "instance-2", departure: "Bamako", arrival: "Ségou", date: "2026-07-20", time: "10:00" })!;
    expect(findSelectedTrip(trips, selection)?.id).toBe("instance-2");
  });
  it("restores from the minimal URL without selecting another time", () => {
    const selection = selectionFromUrl("mali-trans", new URLSearchParams("departure=Bamako&arrival=Segou&date=2026-07-20&time=08%3A00"))!;
    expect(findSelectedTrip(trips, selection)?.id).toBe("instance-1");
    expect(findSelectedTrip(trips, { ...selection, departureTime: "09:00" })).toBeNull();
  });
  it("rejects incomplete and non-object values", () => {
    expect(parseBookingSelection(null)).toBeNull();
    expect(parseBookingSelection("trip")).toBeNull();
    expect(parseBookingSelection({ companySlug: "mali-trans" })).toBeNull();
  });
  it("detects a price change without changing the restored price", () => {
    expect(selectionPriceChanged({ companySlug: "mali-trans", departureCity: "Bamako", arrivalCity: "Ségou", departureDate: "2026-07-20", departureTime: "08:00", price: 4500 }, trips[0])).toBe(true);
  });
});
