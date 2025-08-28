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
  companyId: string;        // normalisé (ex: remplace compagnieId)
  agencyId: string;         // normalisé (ex: remplace agenceId)
  voyageId: string;         // voyage concret (date/heure/bus)
  busId?: string;

  // Client
  clientNom: string;        // normalisé (remplace nomClient | clientNom)
  telephone: string;
  email?: string;

  // Trajet/voyage
  depart: string;           // normalisé (remplace depart)
  arrivee: string;          // normalisé (remplace arrivee)
  date: string;             // ISO yyyy-mm-dd
  heure: string;            // HH:mm
  seatsGo: number;
  seatsReturn?: number;

  // Vente/paiement
  canal: Canal;             // "guichet" | "en_ligne" | "telephone"
  paiementSource?: PaiementSource;
  montant: number;
  statut: ReservationStatus;

  // Guichet/shift (si canal="guichet")
  guichetierId?: string;
  shiftId?: string;

  // Sécurité & référence
  referenceCode: string;
  qrSig?: string;
  qrVersion?: number;

  // Preuve (si en ligne)
  preuveUrl?: string;
  preuveMessage?: string;

  // Métadonnées (snapshots utiles pour UI/exports)
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
  seatMap?: string[];                // ["1A","1B",...]
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
  date: string;                      // yyyy-mm-dd
  heure: string;                     // HH:mm
  depart: string;
  arrivee: string;
  busId?: string;
  immatriculation?: string;
  capaciteEffective?: number;        // capacité réellement dispo
  driverId?: string;
  controleurId?: string;
  statut: "planifie" | "embarquement" | "parti" | "annule";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** ————— Shifts (postes guichetier) ————— */
export interface Shift {
  id: string;
  companyId: string;
  agencyId: string;
  guichetierId: string;
  guichetierNom?: string;
  startTime: string;                 // ISO
  endTime?: string;                  // ISO
  status: "en_service" | "cloture";
  ventesCount?: number;
  montantEncaisse?: number;
  encaissementMode?: "cash" | "mm" | "mixte";
  versementDeclare?: number;
  versementValideParControleur?: boolean;
}

/** ————— WeeklyTrip (gabarit hebdo) ————— */
export interface WeeklyTrip {
  id: string;
  departure: string;                 // normalisé
  arrival: string;                   // normalisé
  horaires?: { [dayName: string]: string[] }; // ex: "lundi":["08:00","14:00"]
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
