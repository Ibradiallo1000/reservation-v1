import { useCallback, useEffect, useState } from "react";
import { collection, collectionGroup, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { derivePopularRoutes, derivePublicCities, filterPublicCompanies, PublicPartnerCompany, PublicTripRecord, PopularRoute } from "./marketplaceData";

type Resource<T> = { data: T; loading: boolean; error: boolean };
const empty = <T,>(data: T): Resource<T> => ({ data, loading: true, error: false });

export function useMarketplaceData() {
  const [cities, setCities] = useState<Resource<string[]>>(empty([]));
  const [routes, setRoutes] = useState<Resource<PopularRoute[]>>(empty([]));
  const [companies, setCompanies] = useState<Resource<PublicPartnerCompany[]>>(empty([]));
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setCities(empty([]));
      setRoutes(empty([]));
      setCompanies(empty([]));

      let trips: PublicTripRecord[] = [];
      try {
        const snapshot = await getDocs(query(collectionGroup(db, "weeklyTrips"), limit(300)));
        trips = snapshot.docs.flatMap((document) => {
          const data = document.data();
          if (data.active === false || data.isActive === false || data.disabled === true) return [];
          const path = document.ref.path.split("/");
          const companyId = path[1] ?? "";
          const departure = typeof data.departure === "string" ? data.departure : "";
          const arrival = typeof data.arrival === "string" ? data.arrival : "";
          return companyId && departure && arrival ? [{ companyId, departure, arrival }] : [];
        });
        if (!cancelled) {
          setCities({ data: derivePublicCities(trips), loading: false, error: false });
          setRoutes({ data: derivePopularRoutes(trips), loading: false, error: false });
        }
      } catch {
        if (!cancelled) {
          setCities({ data: [], loading: false, error: true });
          setRoutes({ data: [], loading: false, error: true });
        }
      }

      try {
        const snapshot = await getDocs(query(
          collection(db, "companies"),
          where("publicPageEnabled", "==", true),
          where("status", "==", "actif"),
          limit(24),
        ));
        const raw = snapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        if (!cancelled) setCompanies({ data: filterPublicCompanies(raw, trips), loading: false, error: false });
      } catch {
        if (!cancelled) setCompanies({ data: [], loading: false, error: true });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [revision]);

  return { cities, routes, companies, retry };
}
