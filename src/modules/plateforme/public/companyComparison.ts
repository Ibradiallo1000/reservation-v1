import { normalizePublicLabel, normalizeSearchToken } from "./marketplaceData";

export type ComparisonCriteria = { from: string; to: string; date: string };
export type ComparisonCompany = { id: string; name: string; slug: string; logoUrl?: string; currency?: string; active: boolean; published: boolean };
export type ComparisonWeeklyTrip = { id: string; companyId: string; departure: string; arrival: string; active: boolean; schedules: Record<string, string[]>; price?: number };
export type ComparisonInstance = { id: string; companyId: string; weeklyTripId?: string; departure: string; arrival: string; date: string; time?: string; price?: number; status?: string };
export type CompanyComparisonResult = { name: string; slug: string; logoUrl?: string; currency?: string; minimumPrice?: number; departureCount: number; nextDepartureTime?: string; availabilityConfirmed: boolean };

const CANCELLED = new Set(["cancelled", "canceled", "annule", "annulee", "annulé", "annulée"]);
const normalizeTime = (value?: string) => /^\d{1,2}:\d{2}$/.test(value ?? "") ? value!.split(":").map((part) => part.padStart(2, "0")).join(":") : undefined;
const finitePositive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
const routeMatches = (departure: string, arrival: string, criteria: ComparisonCriteria) => normalizeSearchToken(departure) === normalizeSearchToken(criteria.from) && normalizeSearchToken(arrival) === normalizeSearchToken(criteria.to);

export function weekdayKey(date: string): string | null {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return parsed.toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" }).toLocaleLowerCase("fr");
}

export function validateComparisonCriteria(criteria: ComparisonCriteria, today: string): Partial<Record<keyof ComparisonCriteria, string>> {
  const errors: Partial<Record<keyof ComparisonCriteria, string>> = {};
  if (!normalizePublicLabel(criteria.from)) errors.from = "Le départ est requis.";
  if (!normalizePublicLabel(criteria.to)) errors.to = "L’arrivée est requise.";
  if (criteria.from && criteria.to && normalizeSearchToken(criteria.from) === normalizeSearchToken(criteria.to)) errors.to = "Le départ et l’arrivée doivent être différents.";
  if (!criteria.date) errors.date = "La date est requise.";
  else if (!weekdayKey(criteria.date) || criteria.date < today) errors.date = "La date doit être valide, aujourd’hui ou plus tard.";
  return errors;
}

export function aggregateCompanyComparisons(args: { criteria: ComparisonCriteria; companies: ComparisonCompany[]; weeklyTrips: ComparisonWeeklyTrip[]; instances: ComparisonInstance[]; nowTime?: string }): CompanyComparisonResult[] {
  const { criteria, companies, weeklyTrips, instances, nowTime } = args;
  const weekday = weekdayKey(criteria.date);
  if (!weekday) return [];
  const companyMap = new Map(companies.filter((company) => company.active && company.published && company.slug).map((company) => [company.id, company]));
  const slots = new Map<string, { companyId: string; time?: string; price?: number; confirmed: boolean }>();

  weeklyTrips.filter((trip) => trip.active && companyMap.has(trip.companyId) && routeMatches(trip.departure, trip.arrival, criteria)).forEach((trip) => {
    (trip.schedules[weekday] ?? []).forEach((rawTime) => {
      const time = normalizeTime(rawTime);
      if (!time || (nowTime && time <= nowTime)) return;
      slots.set(`${trip.companyId}|${trip.id}|${criteria.date}|${time}`, { companyId: trip.companyId, time, price: finitePositive(trip.price), confirmed: false });
    });
  });

  instances.filter((instance) => companyMap.has(instance.companyId) && instance.date === criteria.date && routeMatches(instance.departure, instance.arrival, criteria)).forEach((instance) => {
    const time = normalizeTime(instance.time);
    const key = instance.weeklyTripId && time ? `${instance.companyId}|${instance.weeklyTripId}|${instance.date}|${time}` : `${instance.companyId}|instance|${instance.id}`;
    if (CANCELLED.has(normalizeSearchToken(instance.status ?? "")) || (nowTime && time && time <= nowTime)) { slots.delete(key); return; }
    slots.set(key, { companyId: instance.companyId, time, price: finitePositive(instance.price), confirmed: true });
  });

  const grouped = new Map<string, Array<{ time?: string; price?: number; confirmed: boolean }>>();
  slots.forEach((slot) => grouped.set(slot.companyId, [...(grouped.get(slot.companyId) ?? []), slot]));
  return [...grouped.entries()].flatMap(([companyId, offers]) => {
    const company = companyMap.get(companyId);
    if (!company || offers.length === 0) return [];
    const prices = offers.flatMap((offer) => offer.price ? [offer.price] : []);
    const times = offers.flatMap((offer) => offer.time ? [offer.time] : []).sort();
    return [{ name: company.name, slug: company.slug, logoUrl: company.logoUrl, currency: company.currency, minimumPrice: prices.length ? Math.min(...prices) : undefined, departureCount: offers.length, nextDepartureTime: times[0], availabilityConfirmed: offers.every((offer) => offer.confirmed) }];
  });
}

export type ComparisonSort = "price" | "time" | "departures" | "name";
export function sortCompanyComparisons(results: CompanyComparisonResult[], sort: ComparisonSort): CompanyComparisonResult[] {
  return [...results].sort((a, b) => {
    if (sort === "price") return (a.minimumPrice ?? Infinity) - (b.minimumPrice ?? Infinity) || a.name.localeCompare(b.name, "fr");
    if (sort === "time") return (a.nextDepartureTime ?? "99:99").localeCompare(b.nextDepartureTime ?? "99:99") || a.name.localeCompare(b.name, "fr");
    if (sort === "departures") return b.departureCount - a.departureCount || a.name.localeCompare(b.name, "fr");
    return a.name.localeCompare(b.name, "fr");
  });
}
