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
      const results = await Promise.allSettled([
        getCountFromServer(collection(db, "companies")),
        getCountFromServer(collectionGroup(db, "agences")),
        getCountFromServer(collectionGroup(db, "reservations")),
      ]);

      if (cancelled) return;

      const companies = results[0].status === "fulfilled" ? results[0].value.data().count : 0;
      const agencies = results[1].status === "fulfilled" ? results[1].value.data().count : 0;
      const reservations = results[2].status === "fulfilled" ? results[2].value.data().count : 0;
      setState({
        companies,
        agencies,
        reservations,
        loading: false,
        error: null,
      });
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
