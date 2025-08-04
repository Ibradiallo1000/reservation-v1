// ✅ src/types/reservationTypes.ts

// =====================================
// Interface : Réservation complète
// =====================================

export interface Reservation {
  // Thème
  couleurPrimaire: string;
  couleurSecondaire: string;

  // Identifiants
  id: string;
  referenceCode: string; // Code unique du billet
  tripId: string;        // Trajet associé
  agencyId: string;
  companyId: string;
  companySlug: string;

  // Client
  clientName: string;    // Nom du client
  clientPhone: string;   // Téléphone
  email?: string;        // Email optionnel

  // Trajet
  departure: string;     // Ville de départ
  arrival: string;       // Ville d'arrivée
  date: string | { seconds: number; nanoseconds: number }; // ISO ou Firestore
  time: string;          // Heure (ex: "14:30")
  seats: number;         // Nombre de places réservées
  montant: number;       // Prix total payé

  // Statut
  statut: 'payé' | 'en_attente' | 'annulé';
  canal: 'en_ligne' | 'guichet' | 'téléphone';

  // Paiement
  preuvePaiementUrl?: string; 

  // Metadata
  createdAt: string | { seconds: number; nanoseconds: number };
}

// =====================================
// Interface : Trajet généré
// =====================================

export interface Trip {
  id: string;           // ex: weeklyTripId_date_heure
  date: string;         // YYYY-MM-DD
  time: string;         // "08:00"
  departure: string;
  arrival: string;
  price: number;
  agencyId: string;
  companyId: string;
  places: number;
  remainingSeats: number;
}
