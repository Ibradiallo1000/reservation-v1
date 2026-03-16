// src/types/reservations.ts
import type { ReservationStatus } from "@/types/reservation";

export interface Reservation {
  id: string;
  agencyId?: string;
  nomClient?: string;
  telephone?: string;
  email?: string;
  referenceCode?: string;
  statut: ReservationStatus;
  canal?: string;
  depart?: string;
  arrivee?: string;
  montant?: number;
  createdAt?: any;
  
  // Preuve de paiement (multiples formats supportés)
  preuve?: { 
    url?: string; 
    status?: string; 
    filename?: string; 
    message?: string; 
    via?: string 
  };
  preuveUrl?: string;
  paymentProofUrl?: string;
  paiementPreuveUrl?: string;
  proofUrl?: string;
  receiptUrl?: string;
  
  // Pour ReservationDetailsPage
  companyId?: string;
  companySlug?: string;
  companyName?: string;
  agencyNom?: string;
  agenceNom?: string;
  publicToken?: string;
  date?: string;
  heure?: string;
  seatsGo?: number;
  seatsReturn?: number;
  tripType?: string;
  paymentMethodLabel?: string;
  reason?: string;
  updatedAt?: string;
  
  [key: string]: any;
}

// Fonction de normalisation commune (retourne valeurs canoniques : paye, en_attente_paiement, preuve_recue)
export function normalizeReservationStatus(status: string): ReservationStatus {
  const s = (status || '').toLowerCase().trim();
  
  if (s.includes('preuve_recue')) return 'preuve_recue';
  if (s.includes('verif') || s.includes('vérif')) return 'preuve_recue';
  if (s.includes('confirm') || s.includes('valid')) return 'confirme';
  if (s.includes('payé') || s.includes('paye')) return 'paye';
  if (s.includes('refus') || s.includes('reject') || s.includes('rejet')) return 'refuse';
  if (s.includes('annul') || s.includes('cancel')) return 'annule';
  if (s.includes('en_attente') || s.includes('pending')) return 'en_attente_paiement';
  
  return s as ReservationStatus;
}

// Fonction pour afficher le libellé du statut (valeurs canoniques)
export function getStatusDisplay(status: ReservationStatus): string {
  switch (status) {
    case 'preuve_recue': return 'En attente de validation';
    case 'confirme': return 'Réservation confirmée';
    case 'paye': return 'Payé';
    case 'refuse': return 'Refusé';
    case 'annule': return 'Annulé';
    case 'en_attente_paiement': return 'En attente de paiement';
    default: return status;
  }
}