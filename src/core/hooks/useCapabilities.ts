import { useState, useEffect, useMemo, useCallback } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import type { Capability } from "@/core/permissions/capabilities";
import { resolveCapabilities } from "@/core/permissions/capabilityEngine";
import type { Plan } from "@/core/subscription/plans";
import { normalizePlan } from "@/core/subscription/plans";
import { DEFAULT_PLAN } from "@/core/subscription/types";

interface UseCapabilitiesReturn {
  hasCapability: (cap: Capability) => boolean;
  hasAll: (caps: Capability[]) => boolean;
  hasAny: (caps: Capability[]) => boolean;
  capabilities: Set<Capability>;
  plan: Plan;
  loading: boolean;
}

const EMPTY_SET = new Set<Capability>();

export function useCapabilities(): UseCapabilitiesReturn {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [subLoading, setSubLoading] = useState(false);

  const companyId = user?.companyId ?? "";
  const role = user?.role ?? "unauthenticated";

  useEffect(() => {
    if (!companyId) {
      setPlan(DEFAULT_PLAN);
      setSubLoading(false);
      return;
    }

    setSubLoading(true);

    return onSnapshot(
      doc(db, "companies", companyId),
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        setPlan(normalizePlan(String(data.plan ?? data.planId ?? "")));
        setSubLoading(false);
      },
      (err) => {
        console.warn("[useCapabilities] Failed to subscribe to company plan:", err);
        setPlan(DEFAULT_PLAN);
        setSubLoading(false);
      }
    );
  }, [companyId]);

  const capabilities = useMemo(() => {
    if (authLoading || subLoading || !user) return EMPTY_SET;
    return resolveCapabilities(role, plan);
  }, [role, plan, authLoading, subLoading, user]);

  const hasCapability = useCallback(
    (cap: Capability) => capabilities.has(cap),
    [capabilities]
  );

  const hasAll = useCallback(
    (caps: Capability[]) => caps.every((c) => capabilities.has(c)),
    [capabilities]
  );

  const hasAny = useCallback(
    (caps: Capability[]) => caps.some((c) => capabilities.has(c)),
    [capabilities]
  );

  return {
    hasCapability,
    hasAll,
    hasAny,
    capabilities,
    plan,
    loading: authLoading || subLoading,
  };
}
