export type PublicBookingSelection = {
  companySlug: string;
  tripId?: string;
  templateId?: string;
  instanceId?: string;
  departureCity: string;
  arrivalCity: string;
  departureDate: string;
  departureTime: string;
  agencyId?: string;
  price?: number;
};

type TripCandidate = {
  id?: unknown;
  weeklyTripId?: unknown;
  agencyId?: unknown;
  departure?: unknown;
  arrival?: unknown;
  date?: unknown;
  time?: unknown;
  price?: unknown;
};

const textValue = (value: unknown) => typeof value === "string" ? value.trim() : "";
const normalizedCity = (value: unknown) => textValue(value).toLocaleLowerCase("fr").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizedTime = (value: unknown) => textValue(value).slice(0, 5);

export function bookingSelectionStorageKey(slug: string) {
  return `public_booking_selection_v1_${encodeURIComponent(slug.trim().toLocaleLowerCase("fr"))}`;
}

export function parseBookingSelection(value: unknown): PublicBookingSelection | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const companySlug = textValue(raw.companySlug ?? raw.slug);
  const departureCity = textValue(raw.departureCity ?? raw.departure);
  const arrivalCity = textValue(raw.arrivalCity ?? raw.arrival);
  const departureDate = textValue(raw.departureDate ?? raw.date);
  const departureTime = normalizedTime(raw.departureTime ?? raw.time);
  if (!companySlug || !departureCity || !arrivalCity || !departureDate || !departureTime) return null;
  const price = Number(raw.price);
  return {
    companySlug,
    departureCity,
    arrivalCity,
    departureDate,
    departureTime,
    ...(textValue(raw.tripId ?? raw.id) && { tripId: textValue(raw.tripId ?? raw.id) }),
    ...(textValue(raw.templateId ?? raw.weeklyTripId) && { templateId: textValue(raw.templateId ?? raw.weeklyTripId) }),
    ...(textValue(raw.instanceId) && { instanceId: textValue(raw.instanceId) }),
    ...(textValue(raw.agencyId ?? raw.agenceId) && { agencyId: textValue(raw.agencyId ?? raw.agenceId) }),
    ...(Number.isFinite(price) && price > 0 && { price }),
  };
}

export function selectionFromUrl(slug: string, search: URLSearchParams): PublicBookingSelection | null {
  return parseBookingSelection({
    companySlug: slug,
    departure: search.get("departure"),
    arrival: search.get("arrival"),
    date: search.get("date"),
    time: search.get("time"),
  });
}

export function findSelectedTrip<T extends TripCandidate>(trips: T[], selection: PublicBookingSelection): T | null {
  const routeMatches = (trip: T) =>
    normalizedCity(trip.departure) === normalizedCity(selection.departureCity) &&
    normalizedCity(trip.arrival) === normalizedCity(selection.arrivalCity) &&
    textValue(trip.date) === selection.departureDate &&
    normalizedTime(trip.time) === selection.departureTime;
  const exactId = selection.instanceId || selection.tripId;
  if (exactId) {
    const exact = trips.find((trip) => textValue(trip.id) === exactId && routeMatches(trip));
    if (exact) return exact;
  }
  if (selection.templateId) {
    const template = trips.find((trip) => textValue(trip.weeklyTripId) === selection.templateId && routeMatches(trip));
    if (template) return template;
  }
  return trips.find((trip) => routeMatches(trip) && (!selection.agencyId || textValue(trip.agencyId) === selection.agencyId)) ?? null;
}

export function selectionPriceChanged(selection: PublicBookingSelection, trip: TripCandidate) {
  const restoredPrice = Number(trip.price);
  return selection.price != null && Number.isFinite(restoredPrice) && restoredPrice > 0 && restoredPrice !== selection.price;
}
