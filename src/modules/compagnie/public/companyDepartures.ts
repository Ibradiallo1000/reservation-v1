import type { ValidTrip } from "@/modules/compagnie/tripInstances/publicValidTripsService";
import { normalizeSearchToken } from "@/modules/plateforme/public/marketplaceData";
import { weekdayKey } from "@/modules/plateforme/public/companyComparison";

export type CompanyDepartureCriteria = { from: string; to: string; date: string };
export type PublicCompanyDeparture = ValidTrip & { availabilityStatus: "confirmed" | "unknown" | "unavailable" };

export function validateCompanyDepartureCriteria(criteria: CompanyDepartureCriteria, today: string) {
  const errors: Partial<Record<keyof CompanyDepartureCriteria, string>> = {};
  if (!criteria.from.trim()) errors.from = "Le départ est requis.";
  if (!criteria.to.trim()) errors.to = "L’arrivée est requise.";
  if (criteria.from && criteria.to && normalizeSearchToken(criteria.from) === normalizeSearchToken(criteria.to)) errors.to = "Le départ et l’arrivée doivent être différents.";
  if (!criteria.date) errors.date = "La date est requise.";
  else if (!weekdayKey(criteria.date) || criteria.date < today) errors.date = "La date doit être valide, aujourd’hui ou plus tard.";
  return errors;
}

export function selectCompanyDepartures(trips: ValidTrip[], criteria: CompanyDepartureCriteria): PublicCompanyDeparture[] {
  const seen = new Set<string>();
  return trips.flatMap((trip) => {
    if (trip.date !== criteria.date || normalizeSearchToken(trip.departure) !== normalizeSearchToken(criteria.from) || normalizeSearchToken(trip.arrival) !== normalizeSearchToken(criteria.to)) return [];
    const key = `${trip.weeklyTripId ?? trip.id}|${trip.date}|${trip.time}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const remaining = Number(trip.remainingSeats);
    const availabilityStatus: PublicCompanyDeparture["availabilityStatus"] = Number.isFinite(remaining) ? (remaining <= 0 ? "unavailable" : "confirmed") : "unknown";
    return [{ ...trip, price: Number.isFinite(trip.price) && trip.price > 0 ? trip.price : 0, availabilityStatus }];
  }).sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

export type DepartureSort = "time" | "price";
export function sortCompanyDepartures(departures: PublicCompanyDeparture[], sort: DepartureSort) {
  return [...departures].sort((a, b) => sort === "price"
    ? (a.price > 0 ? a.price : Infinity) - (b.price > 0 ? b.price : Infinity) || a.time.localeCompare(b.time)
    : a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

export function buildBookingHandoff(args: { slug: string; pathBase?: string; departure: PublicCompanyDeparture; company: { id: string; nom: string; logoUrl?: string } }) {
  const { slug, pathBase, departure, company } = args;
  const params = new URLSearchParams({ departure: departure.departure, arrival: departure.arrival, date: departure.date, time: departure.time });
  return {
    route: `${pathBase ? `/${encodeURIComponent(pathBase)}` : ""}/booking?${params.toString()}`,
    state: {
      tripData: { ...departure, companyId: company.id, agenceId: departure.agencyId, compagnieNom: company.nom, logoUrl: company.logoUrl },
      companyInfo: { id: company.id, slug, nom: company.nom, logoUrl: company.logoUrl },
    },
  };
}
