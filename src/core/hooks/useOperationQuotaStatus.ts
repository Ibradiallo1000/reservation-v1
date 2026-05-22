import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Plan } from "@/core/subscription/plans";
import {
  getOperationQuotaStatus,
  type OperationPlanConfig,
  type OperationQuotaCompany,
  type OperationQuotaStatus,
} from "@/core/subscription/operationQuota";

type PlansData = Partial<Record<Plan, OperationPlanConfig>>;

export function useOperationQuotaStatus(companyId?: string | null): {
  status: OperationQuotaStatus | null;
  loading: boolean;
  quotaReached: boolean;
  quotaWarning: boolean;
} {
  const [company, setCompany] = useState<OperationQuotaCompany | null>(null);
  const [plans, setPlans] = useState<PlansData>({});
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
        setCompany(snap.exists() ? (snap.data() as OperationQuotaCompany) : {});
        setLoading(false);
      },
      () => {
        setCompany(null);
        setLoading(false);
      }
    );
  }, [companyId]);

  useEffect(() => {
    return onSnapshot(
      doc(db, "adminSettings", "plans"),
      (snap) => setPlans(snap.exists() ? (snap.data() as PlansData) : {}),
      () => setPlans({})
    );
  }, []);

  const status = useMemo(
    () => (company ? getOperationQuotaStatus(company, plans) : null),
    [company, plans]
  );
  const quotaReached = Boolean(status && !status.canPerform);
  const quotaWarning = Boolean(status && status.canPerform && status.isNearLimit);

  return { status, loading, quotaReached, quotaWarning };
}
