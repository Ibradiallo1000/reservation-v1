export type PublicTripRecord = {
  departure: string;
  arrival: string;
  companyId: string;
};

export type PublicPartnerCompany = {
  name: string;
  slug: string;
  logoUrl?: string;
  description?: string;
  tripCount: number;
};

export type PopularRoute = {
  departure: string;
  arrival: string;
  tripCount: number;
};

export function normalizePublicLabel(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeSearchToken(value: string): string {
  return normalizePublicLabel(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

export function derivePublicCities(trips: PublicTripRecord[]): string[] {
  const labels = new Map<string, string>();
  trips.forEach(({ departure, arrival }) => {
    [departure, arrival].forEach((value) => {
      const label = normalizePublicLabel(value);
      const key = normalizeSearchToken(label);
      if (key && !labels.has(key)) labels.set(key, label);
    });
  });
  return [...labels.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

export function derivePopularRoutes(trips: PublicTripRecord[], max = 8): PopularRoute[] {
  const routes = new Map<string, PopularRoute>();
  trips.forEach(({ departure, arrival }) => {
    const from = normalizePublicLabel(departure);
    const to = normalizePublicLabel(arrival);
    const key = `${normalizeSearchToken(from)}|${normalizeSearchToken(to)}`;
    if (!from || !to || normalizeSearchToken(from) === normalizeSearchToken(to)) return;
    const current = routes.get(key);
    routes.set(key, current ? { ...current, tripCount: current.tripCount + 1 } : { departure: from, arrival: to, tripCount: 1 });
  });
  return [...routes.values()]
    .sort((a, b) => b.tripCount - a.tripCount || a.departure.localeCompare(b.departure, "fr") || a.arrival.localeCompare(b.arrival, "fr"))
    .slice(0, max);
}

export function filterPublicCompanies(
  raw: Array<Record<string, unknown>>,
  trips: PublicTripRecord[],
  max = 12,
): PublicPartnerCompany[] {
  const counts = new Map<string, number>();
  trips.forEach((trip) => counts.set(trip.companyId, (counts.get(trip.companyId) ?? 0) + 1));
  return raw.flatMap((company) => {
    const id = normalizePublicLabel(company.id);
    const name = normalizePublicLabel(company.nom ?? company.name);
    const slug = normalizePublicLabel(company.slug);
    const active = normalizeSearchToken(String(company.status ?? "")) === "actif";
    if (!id || !name || !slug || company.publicPageEnabled !== true || !active) return [];
    return [{
      name,
      slug,
      logoUrl: normalizePublicLabel(company.logoUrl) || undefined,
      description: normalizePublicLabel(company.descriptionCourte ?? company.description) || undefined,
      tripCount: counts.get(id) ?? 0,
    }];
  }).sort((a, b) => b.tripCount - a.tripCount || a.name.localeCompare(b.name, "fr")).slice(0, max);
}

export type SearchValidation = Partial<Record<"departure" | "arrival" | "date", string>>;

export function validateMarketplaceSearch(departure: string, arrival: string, date: string, today: string): SearchValidation {
  const errors: SearchValidation = {};
  if (!normalizePublicLabel(departure)) errors.departure = "Sélectionnez une ville de départ.";
  if (!normalizePublicLabel(arrival)) errors.arrival = "Sélectionnez une ville d’arrivée.";
  if (departure && arrival && normalizeSearchToken(departure) === normalizeSearchToken(arrival)) errors.arrival = "Le départ et l’arrivée doivent être différents.";
  if (!date) errors.date = "Sélectionnez une date de voyage.";
  else {
    const parsed = new Date(`${date}T00:00:00Z`);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    if (!validDate || date < today) errors.date = "Sélectionnez une date valide, aujourd’hui ou plus tard.";
  }
  return errors;
}
