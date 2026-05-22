import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { normalizePlan, type Plan } from "@/core/subscription/plans";
import { initializeOperationsCounter } from "@/core/subscription/operationQuota";

export type CompanyPlanSnapshot = {
  company: Record<string, unknown> | null;
  plan: Plan;
  loading: boolean;
};

export function useCompanyPlan(companyId: string): CompanyPlanSnapshot {
  const [company, setCompany] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    return onSnapshot(
      doc(db, "companies", companyId),
      (snap) => {
        console.log("📡 PLAN SNAPSHOT", snap.data());
        if (snap.exists()) {
          const data = snap.data() as Record<string, unknown>;
          if (typeof data.currentMonthOperations !== "number") {
            void initializeOperationsCounter(companyId).catch(() => {});
          }
        }
        setCompany(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        setLoading(false);
      },
      () => {
        setCompany(null);
        setLoading(false);
      }
    );
  }, [companyId]);

  const plan = useMemo(() => normalizePlan(String(company?.plan ?? company?.planId ?? "")), [company]);

  return { company, plan, loading };
}
