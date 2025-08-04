import type { Timestamp } from 'firebase/firestore';

// ✅ Statuts possibles
export type ReservationStatus = 'en_attente' | 'payé' | 'preuve_recue' | 'refusé' | 'annulé';
export type Channel = 'en ligne' | 'agence' | 'téléphone';

// ✅ Modèle de réservation
export interface Reservation {
  preuveUrl: any;
  preuveMessage: any;
  agencyTelephone: string;
  agencyNom: string;
  id: string;
  trajetId?: string;
  canal: Channel;
  montant: number;
  createdAt: Timestamp | Date;
  agenceId?: string;
  clientNom?: string;
  nomClient?: string;
  telephone?: string;
  email?: string;
  statut: ReservationStatus;
  date?: string;
  heure?: string;
  depart?: string;
  arrivee?: string;
  referenceCode?: string;
  seatsGo?: number;
  seatsReturn?: number;
  compagnieId?: string;
  companySlug?: string;
  agenceNom?: string;
  agenceTelephone?: string;
  latitude?: number;
  longitude?: number;
}

// ✅ Autres modèles
export interface AvisClient {
  nom: string;
  note: number;
  commentaire: string;
  visible: boolean;
  companyId: string;
  createdAt?: Timestamp | Date;
}

export interface MessageClient {
  nom: string;
  email: string;
  message: string;
  companyId: string;
  createdAt: Timestamp;
}

export interface Agency {
  id: string;
  nom: string;
  ville: string;
  companyId: string;
  statut?: 'active' | 'inactive';
}

export interface AgencyStats extends Agency {
  reservations: number;
  revenus: number;
  courriers: number;
  canaux: { [canal: string]: number };
}

export interface GlobalStats {
  totalAgencies: number;
  totalReservations: number;
  totalRevenue: number;
  totalCouriers: number;
  growthRate: number;
  totalChannels: { [canal: string]: number };
}

export interface Trip {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  agencyId: string;
  companyId: string;
  places: number;
  remainingSeats: number;
}

export interface WeeklyTrip {
  id: string;
  departure?: string;
  arrival?: string;
  depart?: string;
  arrivee?: string;
  horaires?: {
    [dayName: string]: string[];
  };
  price: number;
  places: number;
  [key: string]: any;
}

export interface TripSuggestion {
  id: string;
  title: string;
  departure: string;
  arrival: string;
  price: number;
  imageUrl?: string; // ✅ ajout
}
