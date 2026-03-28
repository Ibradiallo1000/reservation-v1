/**
 * Parcours réservation en ligne : seul le champ Firestore `status` compte
 * ("en_attente" | "payé" | "annulé").
 */
export function isReservationAwaitingPayment(status: unknown): boolean {
  return status === "en_attente";
}
