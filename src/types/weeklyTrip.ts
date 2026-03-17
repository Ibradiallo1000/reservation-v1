export interface WeeklyTrip {
  id: string;
  /** Route id (companies/{companyId}/routes/{routeId}). When set, departure/arrival are set from direction. */
  routeId?: string | null;
  /** Canonical route label for display only (e.g. "Bamako-Gao"). Never derive departure/arrival from this. */
  route?: string | null;
  departureCity?: string;
  arrivalCity?: string;
  /** Legacy: use departureCity when present. */
  departure?: string;
  /** Legacy: use arrivalCity when present. */
  arrival?: string;
  depart?: string;
  arrivee?: string;
  /** Optional link to assigned vehicle (companies/{companyId}/vehicles/{vehicleId}). Kept optional for backward compatibility. */
  vehicleId?: string | null;
  horaires?: {
    [dayName: string]: string[];
  };
  price: number;
  /** Seat count (operational). Prefer over places when both exist. */
  seats?: number;
  /** Legacy seat count. */
  places: number;
  agencyId?: string | null;
  status?: string | null;
  updatedAt?: unknown;
  [key: string]: any;
}
