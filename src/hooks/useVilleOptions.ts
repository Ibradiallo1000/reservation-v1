// ✅ Fichier 1 : src/hooks/useVilleOptions.ts

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export const useVilleOptions = (companyId: string | undefined) => {
  const [villes, setVilles] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) return;

    const fetchVilles = async () => {
      const q = query(collection(db, 'weeklyTrips'), where('companyId', '==', companyId));
      const snapshot = await getDocs(q);
      const allTrips = snapshot.docs.map((doc) => doc.data());

      const departures = allTrips.map((t: any) => t.departure?.toLowerCase()?.trim());
      const arrivals = allTrips.map((t: any) => t.arrival?.toLowerCase()?.trim());

      const unique = Array.from(new Set([...departures, ...arrivals])).filter(Boolean);
      setVilles(unique);
    };

    fetchVilles();
  }, [companyId]);

  return villes;
};