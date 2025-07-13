import type { Timestamp } from 'firebase/firestore';
export type { Company } from './companyTypes';

// ✅ Statuts possibles pour les réservations
export type ReservationStatus = 'en_attente' | 'payé' | 'preuve_recue' | 'refusé' | 'annulé';

// ✅ Canaux possibles
export type Channel = 'en ligne' | 'agence' | 'téléphone';

// ✅ Modèle de réservation complet
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

// ✅ Avis client
export interface AvisClient {
  nom: string;
  note: number;
  commentaire: string;
  visible: boolean;
  companyId: string;
  createdAt?: Timestamp | Date;
}

// ✅ Message client
export interface MessageClient {
  nom: string;
  email: string;
  message: string;
  companyId: string;
  createdAt: Timestamp;
}

// ✅ Agence (simplifiée)
export interface Agency {
  id: string;
  nom: string;
  ville: string;
  companyId: string;
  statut?: 'active' | 'inactive';
}

// ✅ Stats étendues
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
