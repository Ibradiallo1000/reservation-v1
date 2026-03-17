/**
 * Calcul unifié des places restantes — source unique de vérité.
 * Toujours utiliser la SOMME des places des réservations, jamais le nombre de réservations (length).
 */

export type ReservationLike = {
  seatsGo?: number;
  seatsReturn?: number;
  /** Fallback si seatsGo absent (legacy). */
  places?: number;
};

/**
 * Nombre de places réservées = somme des (seatsGo + seatsReturn) par réservation.
 * Fallback : places ?? 1 si seatsGo/seatsReturn absents.
 */
export function getReservedPlaces(reservations: ReservationLike[]): number {
  return reservations.reduce(
    (sum, r) =>
      sum +
      (Number(r.seatsGo) || Number(r.places) || 1) +
      (Number(r.seatsReturn) || 0),
    0
  );
}

/**
 * Places restantes = capacité totale − somme des places réservées.
 * À utiliser partout où on affiche "places restantes" pour un trajet.
 */
export function calculateRemainingPlaces(
  totalPlaces: number,
  reservations: ReservationLike[]
): number {
  return Math.max(0, totalPlaces - getReservedPlaces(reservations));
}
