import { describe, expect, it } from "vitest";
import { aggregateCompanyComparisons, ComparisonCompany, ComparisonInstance, ComparisonWeeklyTrip, sortCompanyComparisons, validateComparisonCriteria, weekdayKey } from "./companyComparison";

const criteria = { from: "Bamako", to: "Ségou", date: "2026-07-20" };
const companies: ComparisonCompany[] = [
  { id: "c1", name: "Alpha", slug: "alpha transport", active: true, published: true, currency: "XOF" },
  { id: "c2", name: "Beta", slug: "beta", active: true, published: true },
  { id: "c3", name: "Inactive", slug: "inactive", active: false, published: true },
];
const weekly: ComparisonWeeklyTrip[] = [
  { id: "w1", companyId: "c1", departure: "Bamako", arrival: "Segou", active: true, schedules: { lundi: ["08:00", "08:00", "12:00"] }, price: 5000 },
  { id: "w2", companyId: "c2", departure: "Bamako", arrival: "Ségou", active: true, schedules: { lundi: ["09:00"] } },
  { id: "w3", companyId: "c3", departure: "Bamako", arrival: "Ségou", active: true, schedules: { lundi: ["10:00"] }, price: 3000 },
  { id: "w4", companyId: "c1", departure: "Ségou", arrival: "Bamako", active: true, schedules: { lundi: ["11:00"] }, price: 1000 },
];

describe("company comparison criteria", () => {
  it("validates required, different cities and real dates", () => {
    expect(validateComparisonCriteria({ from: "", to: "", date: "" }, "2026-07-18")).toHaveProperty("from");
    expect(validateComparisonCriteria({ from: "Ségou", to: "segou", date: "2026-07-20" }, "2026-07-18")).toHaveProperty("to");
    expect(validateComparisonCriteria({ from: "A", to: "B", date: "2026-02-31" }, "2026-01-01")).toHaveProperty("date");
    expect(validateComparisonCriteria(criteria, "2026-07-18")).toEqual({});
  });
  it("resolves the actual circulation weekday", () => expect(weekdayKey("2026-07-20")).toBe("lundi"));
});

describe("company comparison aggregation", () => {
  it("groups compatible offers, deduplicates slots and excludes inactive companies", () => {
    const results = aggregateCompanyComparisons({ criteria, companies, weeklyTrips: weekly, instances: [] });
    expect(results).toHaveLength(2);
    expect(results.find((row) => row.name === "Alpha")).toMatchObject({ departureCount: 2, minimumPrice: 5000, nextDepartureTime: "08:00" });
    expect(results.some((row) => row.name === "Inactive")).toBe(false);
  });
  it("uses an instance price and excludes a cancelled materialized slot", () => {
    const instances: ComparisonInstance[] = [
      { id: "i1", companyId: "c1", weeklyTripId: "w1", departure: "Bamako", arrival: "Ségou", date: criteria.date, time: "08:00", price: 4500, status: "scheduled" },
      { id: "i2", companyId: "c1", weeklyTripId: "w1", departure: "Bamako", arrival: "Ségou", date: criteria.date, time: "12:00", price: 5000, status: "cancelled" },
    ];
    expect(aggregateCompanyComparisons({ criteria, companies, weeklyTrips: weekly, instances }).find((row) => row.name === "Alpha")).toMatchObject({ departureCount: 1, minimumPrice: 4500, nextDepartureTime: "08:00", availabilityConfirmed: true });
  });
  it("keeps a company when its price is unavailable and removes past times", () => {
    const result = aggregateCompanyComparisons({ criteria, companies, weeklyTrips: weekly, instances: [], nowTime: "08:30" }).find((row) => row.name === "Beta");
    expect(result).toMatchObject({ departureCount: 1, minimumPrice: undefined });
  });
  it("sorts known prices first, then time, frequency and name", () => {
    const rows = aggregateCompanyComparisons({ criteria, companies, weeklyTrips: weekly, instances: [] });
    expect(sortCompanyComparisons(rows, "price").map((row) => row.name)).toEqual(["Alpha", "Beta"]);
    expect(sortCompanyComparisons(rows, "time")[0].name).toBe("Alpha");
    expect(sortCompanyComparisons(rows, "departures")[0].name).toBe("Alpha");
    expect(sortCompanyComparisons(rows, "name")[0].name).toBe("Alpha");
  });
});
