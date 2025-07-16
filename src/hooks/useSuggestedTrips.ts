import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { TripSuggestion } from '@/types/companyTypes';

interface UseSuggestedTripsParams {
  companyId: string;
  max?: number;
}

const useSuggestedTrips = ({ companyId, max = 5 }: UseSuggestedTripsParams) => {
  const [suggestions, setSuggestions] = useState<TripSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrips = async () => {
      try {
        const tripsRef = collection(db, 'weeklyTrips');
        const q = query(tripsRef, where('companyId', '==', companyId));
        const snapshot = await getDocs(q);

        const rawTrips = snapshot.docs.map((doc) => doc.data());

        // 🔁 Créer un regroupement unique des trajets
        const grouped = new Map<string, TripSuggestion>();

        for (const trip of rawTrips) {
          const key = `${trip.depart}__${trip.arrivee}`;
          if (!grouped.has(key)) {
            grouped.set(key, {
              departure: trip.depart,
              arrival: trip.arrivee,
              price: trip.prix,
              frequency: trip.days?.length > 0 ? `${trip.days.length} jours / sem.` : undefined,
            });
          }
        }

        // ✅ Sélectionner les premiers (limite fixée)
        const topSuggestions = Array.from(grouped.values()).slice(0, max);
        setSuggestions(topSuggestions);
      } catch (error) {
        console.error('Erreur chargement trajets suggérés :', error);
      } finally {
        setLoading(false);
      }
    };

    if (companyId) {
      fetchTrips();
    }
  }, [companyId, max]);

  return { suggestions, loading };
};

export default useSuggestedTrips;
