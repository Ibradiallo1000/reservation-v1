// src/hooks/useVilleOptions.ts
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export const useVilleOptions = (companyId?: string) => {
  const [villes, setVilles] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) return;

    const fetchVilles = async () => {
      try {
        // 1) Récupérer toutes les agences de la compagnie
        const agencesSnap = await getDocs(
          collection(db, `companies/${companyId}/agences`)
        );

        // 2) Pour chaque agence, lire /weeklyTrips
        const allTripsArrays = await Promise.all(
          agencesSnap.docs.map(async (ag) => {
            const tripsSnap = await getDocs(
              collection(db, `companies/${companyId}/agences/${ag.id}/weeklyTrips`)
            );
            return tripsSnap.docs.map((d) => d.data() as any);
          })
        );

        // 3) Aplatir + extraire departures/arrivals
        const trips = allTripsArrays.flat();
        const departures = trips.map(t => t?.departure?.toLowerCase()?.trim());
        const arrivals  = trips.map(t => t?.arrival?.toLowerCase()?.trim());

        const unique = Array.from(new Set([...departures, ...arrivals]))
          .filter(Boolean) as string[];

        setVilles(unique);
      } catch (e) {
        console.error('useVilleOptions ► lecture weeklyTrips échouée :', e);
        setVilles([]);
      }
    };

    fetchVilles();
  }, [companyId]);

  return villes;
};
