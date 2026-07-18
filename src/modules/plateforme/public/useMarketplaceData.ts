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
  const [diagnostics, setDiagnostics] = useState({ companiesLoaded: 0, eligiblePartners: 0, activeTrips: 0, publicCities: 0, companyReadLimit: 100, tripReadLimit: 300 });
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setCities(empty([]));
      setRoutes(empty([]));
      setCompanies(empty([]));

      let trips: PublicTripRecord[] = [];
      try {
        const [tripSnapshot, companySnapshot] = await Promise.all([
          getDocs(query(collectionGroup(db, "weeklyTrips"), limit(300))),
          getDocs(query(collection(db, "companies"), where("publicPageEnabled", "==", true), limit(100))),
        ]);
        const rawCompanies: Array<Record<string, unknown>> = companySnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        const eligibleCompanies = filterPublicCompanies(rawCompanies, [], 100);
        const eligibleSlugs = new Set(eligibleCompanies.map((company) => company.slug));
        const eligibleIds = new Set(rawCompanies.filter((company) => eligibleSlugs.has(String(company.slug ?? "").trim())).map((company) => String(company.id)));
        trips = tripSnapshot.docs.flatMap((document) => {
          const data = document.data();
          if (data.active === false || data.isActive === false || data.disabled === true) return [];
          const path = document.ref.path.split("/");
          const companyId = path[1] ?? "";
          const departure = String(data.departureCity ?? data.departure ?? data.depart ?? "").trim();
          const arrival = String(data.arrivalCity ?? data.arrival ?? data.arrivee ?? "").trim();
          return eligibleIds.has(companyId) && departure && arrival ? [{ companyId, departure, arrival }] : [];
        });
        if (!cancelled) {
          const publicCities = derivePublicCities(trips);
          const partners = filterPublicCompanies(rawCompanies, trips);
          setCities({ data: publicCities, loading: false, error: false });
          setRoutes({ data: derivePopularRoutes(trips), loading: false, error: false });
          setCompanies({ data: partners, loading: false, error: false });
          setDiagnostics({ companiesLoaded: rawCompanies.length, eligiblePartners: partners.length, activeTrips: trips.length, publicCities: publicCities.length, companyReadLimit: 100, tripReadLimit: 300 });
        }
      } catch {
        if (!cancelled) {
          setCities({ data: [], loading: false, error: true });
          setRoutes({ data: [], loading: false, error: true });
          setCompanies({ data: [], loading: false, error: true });
        }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [revision]);

  return { cities, routes, companies, diagnostics, retry };
}
