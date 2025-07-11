// ✅ src/types/reservationTypes.ts

export interface Reservation {
  companySlug: any;
  id: string;
  
  clientName: string; // Nom du client
  clientPhone: string; // Téléphone du client
  email?: string; // Email optionnel
  tripId: string; // ID du trajet associé
  agencyId: string; // ID de l'agence
  companyId: string; // ID de la compagnie
  departure: string; // Ville de départ
  arrival: string; // Ville d'arrivée
  date: string; // Format ISO: YYYY-MM-DD
  time: string; // Heure de départ, ex: "14:30"
  seats: number; // Nombre de places réservées
  montant: number; // Prix payé
  statut: 'payé' | 'en_attente' | 'annulé'; // Statut de la réservation
  canal: 'en_ligne' | 'guichet' | 'téléphone'; // Canal de réservation
  preuvePaiementUrl?: string; // URL vers la preuve de paiement
  referenceCode: string; // Code de référence unique
  createdAt: string; // Date de création (ISO ou Firestore timestamp)
}
