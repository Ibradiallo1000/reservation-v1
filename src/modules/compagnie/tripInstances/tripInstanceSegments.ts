/**
 * Segments physiques du bus : une entrée par portion entre deux arrêts consécutifs.
 * `remaining` = places encore vendables sur ce segment (source de vérité par portion).
 */

export type TripInstanceSegment = {
  from: string;
  to: string;
  remaining: number;
};

export function normalizeCityKey(city: string): string {
  return String(city ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Construit segments[i] = (stops[i] → stops[i+1]) avec même capacité initiale. */
export function buildSegmentsFromStops(stops: string[], capacity: number): TripInstanceSegment[] {
  const cap = Math.max(0, Number(capacity) || 0);
  const segs: TripInstanceSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    segs.push({
      from: String(stops[i] ?? "").trim(),
      to: String(stops[i + 1] ?? "").trim(),
      remaining: cap,
    });
  }
  return segs;
}

/**
 * Indices 0-based dans `instance.segments` pour le trajet passager `fromCity` → `toCity`.
 */
function segmentIndicesForStopsRoute(stops: string[], fromCity: string, toCity: string): number[] {
  if (!stops || stops.length < 2) return [];
  const norm = normalizeCityKey;
  const fi = stops.findIndex((s) => norm(s) === norm(fromCity));
  const ti = stops.findIndex((s) => norm(s) === norm(toCity));
  if (fi < 0 || ti < 0 || fi >= ti) return [];
  const indices: number[] = [];
  for (let i = fi; i < ti; i++) indices.push(i);
  return indices;
}

/**
 * Segments concernés pour `fromCity` → `toCity` (objets de l’instance, avec `remaining`).
 */
export function getSegmentsForRoute(
  stops: string[],
  fromCity: string,
  toCity: string,
  instanceSegments: TripInstanceSegment[]
): TripInstanceSegment[];

/**
 * Indices des segments traversés (pour `instanceSegments[i]`). Même logique que la forme à 4 arguments.
 */
export function getSegmentsForRoute(stops: string[], fromCity: string, toCity: string): number[];

export function getSegmentsForRoute(
  stops: string[],
  fromCity: string,
  toCity: string,
  instanceSegments?: TripInstanceSegment[]
): number[] | TripInstanceSegment[] {
  const indices = segmentIndicesForStopsRoute(stops, fromCity, toCity);
  if (instanceSegments !== undefined) {
    return indices
      .map((i) => instanceSegments[i])
      .filter((s): s is TripInstanceSegment => s != null);
  }
  return indices;
}

/**
 * Segments occupés pour des ordres d’arrêt 1-based (alignés sur RouteStopDoc.order).
 * Ex. origine 2, destination 4 → segments d’index 1 et 2 (2→3, 3→4).
 */
export function getSegmentIndicesFromStopOrders(
  numStops: number,
  originOrder: number,
  destOrder: number
): number[] {
  if (numStops < 2 || originOrder >= destOrder || originOrder < 1 || destOrder > numStops) return [];
  const numSeg = numStops - 1;
  const startSeg = originOrder - 1;
  const endSeg = destOrder - 2;
  const out: number[] = [];
  for (let s = startSeg; s <= endSeg && s < numSeg; s++) {
    if (s >= 0) out.push(s);
  }
  return out;
}

export function allSegmentIndices(segmentCount: number): number[] {
  return Array.from({ length: Math.max(0, segmentCount) }, (_, i) => i);
}

export type JourneyForSegments = {
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
  depart?: string;
  arrivee?: string;
};

/**
 * Résout les indices de segments à ajuster pour une réservation.
 * Retourne null si l’instance n’a pas de modèle segments (données legacy).
 */
export function resolveJourneySegmentIndices(
  stops: string[] | undefined,
  segments: TripInstanceSegment[] | undefined,
  journey: JourneyForSegments
): number[] | null {
  if (!Array.isArray(stops) || stops.length < 2) return null;
  if (!Array.isArray(segments) || segments.length !== stops.length - 1) return null;

  const n = stops.length;
  let indices: number[] = [];

  if (
    journey.originStopOrder != null &&
    journey.destinationStopOrder != null &&
    Number.isFinite(journey.originStopOrder) &&
    Number.isFinite(journey.destinationStopOrder)
  ) {
    indices = getSegmentIndicesFromStopOrders(
      n,
      Number(journey.originStopOrder),
      Number(journey.destinationStopOrder)
    );
  }

  if (indices.length === 0 && journey.depart && journey.arrivee) {
    indices = segmentIndicesForStopsRoute(stops, journey.depart, journey.arrivee);
  }

  if (indices.length === 0) {
    indices = allSegmentIndices(segments.length);
  }

  return indices.length > 0 ? indices : null;
}

export function minRemainingForIndices(segments: TripInstanceSegment[], indices: number[]): number {
  let m = Infinity;
  for (const i of indices) {
    const seg = segments[i];
    if (!seg) continue;
    const rem = Math.max(0, Number(seg.remaining) || 0);
    m = Math.min(m, rem);
  }
  return m === Infinity ? 0 : m;
}

/** Met à jour remaining sur les indices donnés ; retourne une copie du tableau segments. */
export function applySegmentDelta(
  segments: TripInstanceSegment[],
  indices: number[],
  delta: number
): TripInstanceSegment[] {
  const next = segments.map((s) => ({ ...s }));
  for (const i of indices) {
    if (i < 0 || i >= next.length) continue;
    const prev = Math.max(0, Number(next[i].remaining) || 0);
    next[i] = { ...next[i], remaining: Math.max(0, prev + delta) };
  }
  return next;
}

/** Libération de places : ne pas dépasser la capacité bus sur chaque segment. */
export function applySegmentDeltaCapped(
  segments: TripInstanceSegment[],
  indices: number[],
  delta: number,
  cap: number
): TripInstanceSegment[] {
  const next = segments.map((s) => ({ ...s }));
  const c = Math.max(0, Number(cap) || 0);
  for (const i of indices) {
    if (i < 0 || i >= next.length) continue;
    const prev = Math.max(0, Number(next[i].remaining) || 0);
    next[i] = { ...next[i], remaining: Math.min(c, Math.max(0, prev + delta)) };
  }
  return next;
}
