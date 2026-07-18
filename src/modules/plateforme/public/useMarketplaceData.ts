import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getSupportedCountry, isSupportedCountryCode, type SupportedCountryCode } from "@/config/supportedCountries";
import { deriveMarketplaceCountries, derivePopularRoutes, derivePublicCities, filterMarketplaceByCountry, filterPublicCompanies, type PublicPartnerCompany, type PublicTripRecord } from "./marketplaceData";

const COUNTRY_STORAGE_KEY = "teliya.marketplace.countryCode";

export function useMarketplaceData() {
  const [allTrips, setAllTrips] = useState<PublicTripRecord[]>([]);
  const [allCompanies, setAllCompanies] = useState<PublicPartnerCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selectedCountryCode, setSelectedCountryCodeState] = useState<SupportedCountryCode | null>(() => {
    try {
      const stored = localStorage.getItem(COUNTRY_STORAGE_KEY);
      return isSupportedCountryCode(stored) ? stored.toUpperCase() as SupportedCountryCode : null;
    } catch { return null; }
  });
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const [tripSnapshot, companySnapshot] = await Promise.all([
          getDocs(query(collectionGroup(db, "weeklyTrips"), limit(300))),
          getDocs(query(collection(db, "companies"), where("publicPageEnabled", "==", true), limit(100))),
        ]);
        const rawCompanies: Array<Record<string, unknown>> = companySnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
        const eligibleCompanies = filterPublicCompanies(rawCompanies, [], 100);
        const eligibleIds = new Set(eligibleCompanies.map((company) => company.companyId));
        const trips = tripSnapshot.docs.flatMap((document) => {
          const data = document.data();
          if (data.active === false || data.isActive === false || data.disabled === true) return [];
          const companyId = document.ref.path.split("/")[1] ?? "";
          const departure = String(data.departureCity ?? data.departure ?? data.depart ?? "").trim();
          const arrival = String(data.arrivalCity ?? data.arrival ?? data.arrivee ?? "").trim();
          return eligibleIds.has(companyId) && departure && arrival ? [{ companyId, departure, arrival }] : [];
        });
        if (!cancelled) {
          setAllTrips(trips);
          setAllCompanies(filterPublicCompanies(rawCompanies, trips, 100));
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setAllTrips([]); setAllCompanies([]); setLoading(false); setError(true); }
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [revision]);

  const countryCodes = useMemo(() => deriveMarketplaceCountries(allCompanies), [allCompanies]);
  const effectiveCountryCode = selectedCountryCode && countryCodes.includes(selectedCountryCode) ? selectedCountryCode : null;
  const filtered = useMemo(() => filterMarketplaceByCountry(allCompanies, allTrips, effectiveCountryCode), [allCompanies, allTrips, effectiveCountryCode]);
  const publicCities = useMemo(() => derivePublicCities(filtered.trips), [filtered.trips]);

  const setSelectedCountryCode = useCallback((code: SupportedCountryCode | null) => {
    setSelectedCountryCodeState(code);
    try {
      if (code) localStorage.setItem(COUNTRY_STORAGE_KEY, code);
      else localStorage.removeItem(COUNTRY_STORAGE_KEY);
    } catch { /* Storage may be disabled; filtering still works for this session. */ }
  }, []);

  return {
    cities: { data: publicCities, loading, error },
    routes: { data: derivePopularRoutes(filtered.trips), loading, error },
    companies: { data: filtered.companies, loading, error },
    countries: countryCodes.map(getSupportedCountry),
    selectedCountryCode: effectiveCountryCode,
    setSelectedCountryCode,
    diagnostics: { companiesLoaded: allCompanies.length, eligiblePartners: filtered.companies.length, activeTrips: filtered.trips.length, publicCities: publicCities.length, companyReadLimit: 100, tripReadLimit: 300 },
    retry,
  };
}
