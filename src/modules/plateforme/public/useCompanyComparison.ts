import { useEffect, useState } from "react";
import { collection, collectionGroup, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { aggregateCompanyComparisons, ComparisonCompany, ComparisonCriteria, ComparisonInstance, ComparisonWeeklyTrip, CompanyComparisonResult } from "./companyComparison";

export function useCompanyComparison(criteria: ComparisonCriteria, enabled: boolean) {
  const [state, setState] = useState<{ loading: boolean; error: boolean; partial: boolean; results: CompanyComparisonResult[] }>({ loading: enabled, error: false, partial: false, results: [] });
  useEffect(() => {
    if (!enabled) { setState({ loading: false, error: false, partial: false, results: [] }); return; }
    let cancelled = false;
    const load = async () => {
      setState({ loading: true, error: false, partial: false, results: [] });
      try {
        const [instanceResult, weeklyResult, companyResult] = await Promise.allSettled([
          getDocs(query(collectionGroup(db, "tripInstances"), where("date", "==", criteria.date), limit(300))),
          getDocs(query(collectionGroup(db, "weeklyTrips"), limit(500))),
          getDocs(query(collection(db, "companies"), where("publicPageEnabled", "==", true), where("status", "==", "actif"), limit(100))),
        ]);
        if (companyResult.status === "rejected" || (instanceResult.status === "rejected" && weeklyResult.status === "rejected")) throw new Error("public-comparison-unavailable");
        const companies: ComparisonCompany[] = companyResult.value.docs.map((doc) => { const data = doc.data(); return { id: doc.id, name: String(data.nom ?? data.name ?? "").trim(), slug: String(data.slug ?? "").trim(), logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : undefined, currency: typeof data.devise === "string" ? data.devise : undefined, active: data.status === "actif", published: data.publicPageEnabled === true }; });
        const weeklyTrips: ComparisonWeeklyTrip[] = weeklyResult.status === "fulfilled" ? weeklyResult.value.docs.map((doc) => { const data = doc.data(); return { id: doc.id, companyId: doc.ref.path.split("/")[1] ?? "", departure: String(data.departureCity ?? data.departure ?? ""), arrival: String(data.arrivalCity ?? data.arrival ?? ""), active: data.active !== false && data.isActive !== false && data.disabled !== true, schedules: typeof data.horaires === "object" && data.horaires ? data.horaires as Record<string, string[]> : {}, price: typeof data.price === "number" ? data.price : Number(data.price) || undefined }; }) : [];
        const instances: ComparisonInstance[] = instanceResult.status === "fulfilled" ? instanceResult.value.docs.map((doc) => { const data = doc.data(); return { id: doc.id, companyId: doc.ref.path.split("/")[1] ?? "", weeklyTripId: typeof data.weeklyTripId === "string" ? data.weeklyTripId : undefined, departure: String(data.departureCity ?? data.departure ?? ""), arrival: String(data.arrivalCity ?? data.arrival ?? ""), date: String(data.date ?? ""), time: String(data.departureTime ?? data.time ?? "") || undefined, price: typeof data.price === "number" ? data.price : Number(data.price) || undefined, status: typeof data.status === "string" ? data.status : undefined }; }) : [];
        const now = new Date();
        const nowTime = criteria.date === now.toISOString().slice(0, 10) ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}` : undefined;
        const results = aggregateCompanyComparisons({ criteria, companies, weeklyTrips, instances, nowTime });
        if (!cancelled) setState({ loading: false, error: false, partial: instanceResult.status === "rejected" || weeklyResult.status === "rejected", results });
      } catch { if (!cancelled) setState({ loading: false, error: true, partial: false, results: [] }); }
    };
    void load();
    return () => { cancelled = true; };
  }, [criteria, enabled]);
  return state;
}
