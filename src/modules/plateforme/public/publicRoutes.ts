export const PUBLIC_ROUTES = {
  marketplace: "/",
  landing: "/landing",
  results: "/resultats",
  reservation: "/reservation",
} as const;

export type PublicSearchCriteria = {
  departure: string;
  arrival: string;
  date?: string;
};

export function buildMarketplaceResultsRoute(criteria: PublicSearchCriteria): string {
  const params = new URLSearchParams({
    from: criteria.departure.trim(),
    to: criteria.arrival.trim(),
  });
  if (criteria.date?.trim()) params.set("date", criteria.date.trim());
  return `${PUBLIC_ROUTES.results}?${params.toString()}`;
}

export function buildCompanyResultsRoute(slug: string, criteria: PublicSearchCriteria): string {
  const params = new URLSearchParams({
    from: criteria.departure.trim(),
    to: criteria.arrival.trim(),
  });
  if (criteria.date?.trim()) params.set("date", criteria.date.trim());
  return `/compagnie/${encodeURIComponent(slug)}/resultats?${params.toString()}`;
}

export function buildLegacyCompanyResultsRoute(slug: string, search: string): string {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  const to = params.get("to");
  if (from && !params.has("departure")) params.set("departure", from);
  if (to && !params.has("arrival")) params.set("arrival", to);
  params.delete("from");
  params.delete("to");
  const suffix = params.toString();
  return `/${encodeURIComponent(slug)}/resultats${suffix ? `?${suffix}` : ""}`;
}

export function buildLegacyReservationRoute(search: string): string | null {
  const params = new URLSearchParams(search);
  const slug = params.get("slug")?.trim();
  if (!slug) return null;
  params.delete("slug");
  const suffix = params.toString();
  return `/${encodeURIComponent(slug)}/booking${suffix ? `?${suffix}` : ""}`;
}
