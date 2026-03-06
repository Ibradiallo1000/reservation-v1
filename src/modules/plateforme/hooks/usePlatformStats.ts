/**
 * Platform-wide stats for the marketing homepage (companies, agencies, reservations).
 * Uses Firestore counts; falls back to 0 on error or if counts are unavailable.
 */
import { useEffect, useState } from "react";
import { collection, collectionGroup, getCountFromServer } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export interface PlatformStats {
  companies: number;
  agencies: number;
  reservations: number;
  loading: boolean;
  error: string | null;
}

export function usePlatformStats(): PlatformStats {
  const [state, setState] = useState<PlatformStats>({
    companies: 0,
    agencies: 0,
    reservations: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [companiesSnap, agenciesSnap, reservationsSnap] = await Promise.all([
          getCountFromServer(collection(db, "companies")),
          getCountFromServer(collectionGroup(db, "agences")),
          getCountFromServer(collectionGroup(db, "reservations")),
        ]);

        if (cancelled) return;

        setState({
          companies: companiesSnap.data().count,
          agencies: agenciesSnap.data().count,
          reservations: reservationsSnap.data().count,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : "Erreur chargement stats",
        }));
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
