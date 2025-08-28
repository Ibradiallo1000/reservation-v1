// src/types/index.ts
import type { Timestamp } from "firebase/firestore";

/** ————— Enums normalisés ————— */
export type ReservationStatus =
  | "en_attente"
  | "paiement_en_cours"
  | "preuve_recue"
  | "payé"
  | "embarqué"
  | "refusé"
  | "annulé";

export type Canal = "en_ligne" | "guichet" | "telephone";

/** ✅ Alias pour compatibilité avec l’existant (anglais) */
export type Channel = Canal;

export type PaiementSource =
  | "encaisse_guichet"
  | "encaisse_mm"
  | "compte_marchand_compagnie";

/** ————— Modèles principaux ————— */
export interface Reservation {
  nomClient: any;
  trajetId: string;
  // Identité/portée
  id: string;
  companyId: string;
  agencyId: string;
  voyageId: string;
  busId?: string;

  // Client
  clientNom: string;
  telephone: string;
  email?: string;

  // Trajet/voyage
  depart: string;
  arrivee: string;
  date: string;   // yyyy-mm-dd
  heure: string;  // HH:mm
  seatsGo: number;
  seatsReturn?: number;

  // Vente/paiement
  canal: Canal;   // (alias Channel disponible)
  paiementSource?: PaiementSource;
  montant: number;
  statut: ReservationStatus;

  // Guichet/shift
  guichetierId?: string;
  shiftId?: string;

  // Référence
  referenceCode: string;
  qrSig?: string;
  qrVersion?: number;

  // Preuve (en ligne)
  preuveUrl?: string;
  preuveMessage?: string;

  // Métadonnées
  companySlug?: string;
  agencyNom?: string;
  agencyTelephone?: string;
  latitude?: number;
  longitude?: number;

  // Timestamps
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/** ————— Flotte & opérations ————— */
export interface Bus {
  id: string;
  immatriculation: string;
  capacite: number;
  seatMap?: string[];
  statut: "OK" | "maintenance" | "HS";
  proprietaire?: "comp" | "affretement";
  notes?: string;
  updatedAt?: Timestamp;
}

export interface Voyage {
  id: string;
  companyId: string;
  agencyId: string;
  weeklyTripId?: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  busId?: string;
  immatriculation?: string;
  capaciteEffective?: number;
  driverId?: string;
  controleurId?: string;
  statut: "planifie" | "embarquement" | "parti" | "annule";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** ————— WeeklyTrip ————— */
export interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires?: { [dayName: string]: string[] };
  price: number;
  places: number;
  [key: string]: any;
}

/** ————— Vitrine & divers ————— */
export interface TripSuggestion {
  id: string;
  title: string;
  departure: string;
  arrival: string;
  price: number;
  imageUrl?: string;
}

export interface Agency {
  id: string;
  nom: string;
  ville: string;
  companyId: string;
  statut?: "active" | "inactive";
}

export interface AgencyStats extends Agency {
  reservations: number;
  revenus: number;
  courriers: number;
  canaux: { [canal in Canal]?: number };
}

export interface GlobalStats {
  totalAgencies: number;
  totalReservations: number;
  totalRevenue: number;
  totalCouriers: number;
  growthRate: number;
  totalChannels: { [canal in Canal]?: number };
}

export interface AvisClient {
  nom: string;
  note: number;
  commentaire: string;
  visible: boolean;
  companyId: string;
  createdAt?: Timestamp;
}

export interface MessageClient {
  nom: string;
  email: string;
  message: string;
  companyId: string;
  createdAt: Timestamp;
}
