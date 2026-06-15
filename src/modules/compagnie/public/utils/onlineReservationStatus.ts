/**
 * Parcours réservation en ligne : seul le champ Firestore `status` compte
 * ("en_attente" | "payé" | "annulé").
 */
export function isReservationAwaitingPayment(status: unknown): boolean {
  if (typeof status !== 'string') return false;
  const s = status.trim().toLowerCase().replace(' ', '_');
  return s === 'en_attente' || s === 'en_attente_paiement' || s === 'pending';
}

