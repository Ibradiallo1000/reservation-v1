// src/utils/seats.ts
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export type TripLite = {
  id: string;        // weeklyTripId_YYYY-MM-DD_HH:mm
  date: string;      // YYYY-MM-DD
  time: string;      // HH:mm
  places?: number;   // capacité totale (optionnel)
  remainingSeats?: number;
};

const MAX_SEATS_FALLBACK = 30;
const VALID_STATUSES = new Set(['payé', 'preuve_recue']); // même logique que page client

export function listenRemainingSeatsForDate(opts: {
  db: Firestore;
  companyId: string;
  agencyId: string;
  dateISO: string;
  depart: string;
  arrivee: string;
  baseTrips: TripLite[];
  isPast: (dateISO: string, hhmm: string) => boolean;
  onUpdate: (updatedTrips: TripLite[]) => void;
}) {
  const { db, companyId, agencyId, dateISO, depart, arrivee, baseTrips, isPast, onUpdate } = opts;

  const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
  const qy = query(
    rRef,
    where('date', '==', dateISO),
    where('depart', '==', depart),
    where('arrivee', '==', arrivee)
  );

  const unsub = onSnapshot(qy, (snap) => {
    const usedByTrip: Record<string, number> = {};

    snap.forEach((d) => {
      const r = d.data() as any;
      const statut = String(r.statut || '').toLowerCase();
      if (!VALID_STATUSES.has(statut)) return;           // payé / preuve_recue
      const tripKey = r.trajetId;
      const seats = Number(r.seatsGo || 0);              // somme seatsGo uniquement
      usedByTrip[tripKey] = (usedByTrip[tripKey] || 0) + seats;
    });

    const updated = baseTrips.map((t) => {
      if (t.date !== dateISO) return t;
      const total = t.places || MAX_SEATS_FALLBACK;
      const used = usedByTrip[t.id] || 0;
      return { ...t, remainingSeats: Math.max(0, total - used) };
    })
    // filtrer le passé + trier par heure pour l’affichage
    .filter(t => t.date === dateISO && !isPast(t.date, t.time))
    .sort((a, b) => a.time.localeCompare(b.time));

    onUpdate(updated);
  });

  return unsub; // pense à appeler unsub() au cleanup
}
