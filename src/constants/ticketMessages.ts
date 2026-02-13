export interface TicketMessages {
  control: string;
  validity: string;
  arrival: string;
  keep: string;
}

export const DEFAULT_TICKET_MESSAGES: TicketMessages = {
  control: "Présentez ce code au contrôle.",
  validity: "Validité : 1 mois à compter de la date d’émission.",
  arrival: "Présentez-vous 1H avant le départ.",
  keep: "Conservez ce billet jusqu’à l’arrivée."
};
