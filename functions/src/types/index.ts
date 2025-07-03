export type ReservationStatus = 
  | 'en_attente'
  | 'preuve_reçue'
  | 'payé'
  | 'annulé';

export interface Reservation {
  id: string;
  // ... autres champs nécessaires
}

export type Channel = 
  | 'en_ligne'
  | 'agence'
  | 'telephone';