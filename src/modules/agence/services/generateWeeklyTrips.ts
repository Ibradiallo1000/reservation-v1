import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

/** Direction du trajet sur la route. forward = startCity → endCity, reverse = endCity → startCity. */
export type WeeklyTripDirection = "forward" | "reverse";

export interface CreateWeeklyTripOptions {
  scheduleId?: string | null;
  /** When provided, the weekly trip is linked to a route (origin/destination from route + direction). */
  routeId?: string | null;
  /** Canonical route label for display only (e.g. "Bamako-Gao"). Never use to derive departure/arrival. */
  route?: string | null;
  /** Direction on the route: forward (startCity → endCity) or reverse (endCity → startCity). */
  direction?: WeeklyTripDirection;
  /** Origin (or use route + direction when routeId is set). */
  departureCity?: string;
  /** Destination (or use route + direction when routeId is set). */
  arrivalCity?: string;
  /** Seat count (stored as seats and places for backward compat). */
  seats?: number;
}

/** Create a weekly trip document. When routeId is set, origin/destination come from the route; departure/arrival are stored for display. Legacy: departure/arrival only. */
export const generateWeeklyTrips = async (
  companyId: string,
  departure: string,
  arrival: string,
  price: number,
  horaires: { [key: string]: string[] },
  places: number,
  agencyId: string,
  options?: CreateWeeklyTripOptions
): Promise<string> => {
  try {
    const tripsCollection = collection(db, 'companies', companyId, 'agences', agencyId, 'weeklyTrips');
    const newTripRef = doc(tripsCollection);

    const dep = (options?.departureCity ?? departure).trim();
    const arr = (options?.arrivalCity ?? arrival).trim();
    const seats = options?.seats ?? places;

    if (dep.toLowerCase() === arr.toLowerCase()) {
      throw new Error('Départ et arrivée doivent être différents (éviter X → X).');
    }

    console.log('Route (weekly trip):', { route: options?.route ?? `${dep}-${arr}`, direction: options?.direction, departure: dep, arrival: arr });

    const tripData: Record<string, unknown> = {
      id: newTripRef.id,
      departure: dep,
      arrival: arr,
      departureCity: dep,
      arrivalCity: arr,
      price,
      places: seats,
      seats,
      horaires,
      active: true,
      agencyId: agencyId || null,
      status: 'ACTIVE',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (options?.routeId != null && options.routeId !== '') tripData.routeId = options.routeId;
    if (options?.route != null && String(options.route).trim() !== '') tripData.route = String(options.route).trim();
    if (options?.scheduleId != null && options.scheduleId !== '') tripData.scheduleId = options.scheduleId;
    if (options?.direction != null && (options.direction === 'forward' || options.direction === 'reverse')) tripData.direction = options.direction;

    await setDoc(newTripRef, tripData);
    return newTripRef.id;
  } catch (error) {
    console.error('Erreur lors de la création du trajet:', error);
    throw error;
  }
};