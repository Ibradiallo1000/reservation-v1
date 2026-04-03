/**
 * Daily trip instances. Path: companies/{companyId}/tripInstances/{tripInstanceId}
 * Represents the real execution of a scheduled trip (WeeklyTrip → TripInstance).
 */
import type { TripInstanceSegment } from "./tripInstanceSegments";
import {
  getSegmentsForRoute,
  minRemainingForIndices,
  type JourneyForSegments,
} from "./tripInstanceSegments";

export const TRIP_INSTANCE_COLLECTION = "tripInstances";

export const TRIP_INSTANCE_STATUS = {
  SCHEDULED: "scheduled",
  BOARDING: "boarding",
  DEPARTED: "departed",
  ARRIVED: "arrived",
  CANCELLED: "cancelled",
} as const;

export type TripInstanceStatus =
  | "scheduled"
  | "boarding"
  | "departed"
  | "arrived"
  | "cancelled";

export const TRIP_INSTANCE_STATUT_METIER = {
  PLANIFIE: "planifie",
  EMBARQUEMENT_EN_COURS: "embarquement_en_cours",
  EMBARQUEMENT_TERMINE: "embarquement_termine",
  VALIDATION_AGENCE_REQUISE: "validation_agence_requise",
  EN_TRANSIT: "en_transit",
  RETOUR_ORIGINE: "retour_origine",
  TERMINE: "termine",
} as const;

export type TripInstanceStatutMetier =
  | "planifie"
  | "embarquement_en_cours"
  | "embarquement_termine"
  | "validation_agence_requise"
  | "en_transit"
  | "retour_origine"
  | "termine";

export type { TripInstanceSegment, JourneyForSegments };

export interface TripInstanceDoc {
  companyId: string;
  /** Primary / origin agency. Kept for backward compat and simple queries. */
  agencyId: string;
  /** Agence destination officielle du trajet (utilisée pour validations d'arrivée). */
  destinationAgencyId?: string | null;
  /** All agencies involved on this trip (e.g. Bamako → Sikasso → Bouaké). Enables intermediate loading, en-route boarding, per-agency stats. */
  agenciesInvolved?: string[];
  /** Canonical departure city (mirror legacy routeDeparture / departureCity for queries). */
  departure?: string;
  /** Canonical arrival city (mirror legacy routeArrival / arrivalCity). */
  arrival?: string;
  /** Canonical departure time HH:mm (mirror legacy departureTime for orderBy). */
  time?: string;
  /** Canonical seat capacity (mirror legacy seatCapacity / capacitySeats). */
  capacity?: number;
  /**
   * Source of truth for sellable seats. Updated atomically with reservedSeats in tripInstanceService.
   * Legacy docs: use tripInstanceRemainingFromDoc() until backfill.
   */
  remainingSeats?: number;
  /** Route: departure city (alias departureCity for backward compat). */
  routeDeparture: string;
  /** Route: arrival city (alias arrivalCity for backward compat). */
  routeArrival: string;
  weeklyTripId: string | null;
  vehicleId: string | null;
  /** Date of departure (YYYY-MM-DD). */
  date: string;
  /** Departure date as Timestamp for queries. */
  departureDate?: unknown;
  departureTime: string;
  status: TripInstanceStatus;
  /** Source de vérité métier du cycle opérationnel du trajet. */
  statutMetier?: TripInstanceStatutMetier;
  /** Confirmed passengers (reservations). Backward compat: use reservedSeats if absent. */
  passengerCount?: number;
  /** Parcels/shipments assigned to this instance. */
  parcelCount?: number;
  /** Bus seat capacity. Used for fill rate: passengerCount / capacitySeats (e.g. 34/50 = 68%). */
  capacitySeats?: number;
  /** Parcel capacity. Used for fill rate: parcelCount / capacityParcels. */
  capacityParcels?: number;
  createdAt?: unknown;
  createdBy?: string;
  updatedAt?: unknown;
  /** Validation arrivée à destination (workflow inter-agences). */
  arrivalValidatedAt?: unknown;
  arrivalValidatedBy?: string;
  /** Cas exceptionnel: retour vers l'origine (statutMetier reste en_transit). */
  isReturnToOrigin?: boolean;
  /** @deprecated Lire isReturnToOrigin ; conservé pour anciens documents. */
  retourOrigine?: boolean;
  /** Cas exceptionnel: véhicule revenu à la gare d'origine. */
  returnedToOriginAt?: unknown;
  returnedToOriginBy?: string;
  /** Backward compat: same as routeDeparture. */
  departureCity?: string;
  /** Backward compat: same as routeArrival. */
  arrivalCity?: string;
  /** Backward compat: seat capacity from weekly trip (prefer capacitySeats). */
  seatCapacity?: number;
  /** Backward compat: reserved seats (mirrors passengerCount). */
  reservedSeats?: number;
  routeId?: string | null;
  price?: number | null;
  /** Villes d’arrêt dans l’ordre de parcours (pour segments). */
  stops?: string[];
  /** Segments entre arrêts consécutifs ; `remaining` = places vendables sur la portion. */
  segments?: TripInstanceSegment[];
}

export type TripInstanceDocWithId = TripInstanceDoc & { id: string };

/** Canonical capacity: prefer `capacity`, then legacy fields. */
export function tripInstanceSeatCapacity(d: {
  capacity?: number;
  seatCapacity?: number;
  capacitySeats?: number;
}): number {
  const v = d.capacity ?? d.seatCapacity ?? d.capacitySeats;
  return Math.max(0, Number(v) || 0);
}

/** Canonical departure city: `departure` → legacy (migration progressive). */
export function tripInstanceDeparture(ti: unknown): string {
  const o = ti as Record<string, unknown>;
  return String(o.departure ?? o.departureCity ?? o.routeDeparture ?? "").trim();
}

/** Canonical arrival city. */
export function tripInstanceArrival(ti: unknown): string {
  const o = ti as Record<string, unknown>;
  return String(o.arrival ?? o.arrivalCity ?? o.routeArrival ?? "").trim();
}

/** Canonical departure clock time (HH:mm): `time` → `departureTime`. */
export function tripInstanceTime(ti: unknown): string {
  const o = ti as Record<string, unknown>;
  return String(o.time ?? o.departureTime ?? "").trim();
}

/**
 * Places restantes (global) : avec segments, goulot = min(remaining) sur chaque portion.
 * Sinon champ `remainingSeats` ou capacity − reservedSeats.
 */
export function tripInstanceRemainingFromDoc(d: {
  segments?: TripInstanceSegment[];
  remainingSeats?: number;
  capacity?: number;
  seatCapacity?: number;
  capacitySeats?: number;
  reservedSeats?: number;
}): number {
  const cap = tripInstanceSeatCapacity(d);
  const res = Math.max(0, Number(d.reservedSeats) || 0);
  const derived = Math.max(0, cap - res);

  if (Array.isArray(d.segments) && d.segments.length > 0) {
    const bottleneck = Math.min(
      ...d.segments.map((s) => Math.max(0, Number(s.remaining) || 0))
    );
    return Math.max(0, Math.min(bottleneck, derived));
  }

  const fromField =
    typeof d.remainingSeats === "number" && !Number.isNaN(d.remainingSeats) ? d.remainingSeats : null;
  if (fromField == null) return derived;
  return Math.max(0, Math.min(fromField, derived));
}

/**
 * Places vendables pour un couple départ / arrivée (min des segments traversés).
 */
export function tripInstanceRemainingForJourney(
  d: {
    stops?: string[];
    segments?: TripInstanceSegment[];
    remainingSeats?: number;
    capacity?: number;
    seatCapacity?: number;
    capacitySeats?: number;
    reservedSeats?: number;
  },
  depart: string,
  arrivee: string
): number {
  if (
    Array.isArray(d.stops) &&
    d.stops.length >= 2 &&
    Array.isArray(d.segments) &&
    d.segments.length === d.stops.length - 1
  ) {
    const idx = getSegmentsForRoute(d.stops, depart, arrivee);
    if (idx.length > 0) {
      return minRemainingForIndices(d.segments, idx);
    }
  }
  return tripInstanceRemainingFromDoc(d);
}
