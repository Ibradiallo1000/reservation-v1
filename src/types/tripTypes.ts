// ✅ src/types/tripTypes.ts

export interface Trip {
  id: string;
  departure: string; // Ville de départ
  arrival: string; // Ville d'arrivée
  price: number; // Prix du trajet
  agencyId: string; // ID de l'agence associée
  companyId: string; // ID de la compagnie
  daysOfWeek: string[]; // Jours de la semaine pour ce trajet (ex: ['Lundi', 'Mercredi'])
  heureDepart: string; // Heure de départ
  heureArrivee?: string; // Heure d'arrivée (optionnelle)
  placesTotales: number; // Capacité totale
  placesDisponibles: number; // Places encore disponibles
  statut: 'actif' | 'inactif'; // Statut du trajet
  createdAt?: string; // Date de création (optionnelle)
}
