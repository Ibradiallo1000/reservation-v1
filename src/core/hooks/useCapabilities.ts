// src/core/hooks/useCapabilities.ts
// Resolves the current user's effective capabilities by combining their role and company plan.
// Falls back to "starter" plan when no subscription doc exists (backward compatible).

import { useState, useEffect, useMemo, useCallback } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import type { Capability } from "@/core/permissions/capabilities";
import { resolveCapabilities } from "@/core/permissions/capabilityEngine";
import type { Plan } from "@/core/subscription/plans";
import type { CompanySubscription } from "@/core/subscription/types";
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

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let subscriptionCache: { companyId: string; plan: Plan; fetchedAt: number } | null = null;

function getCachedPlan(companyId: string): Plan | null {
  if (!subscriptionCache || subscriptionCache.companyId !== companyId) return null;
  if (Date.now() - subscriptionCache.fetchedAt > CACHE_TTL_MS) return null;
  return subscriptionCache.plan;
}

function setCachedPlan(companyId: string, plan: Plan): void {
  subscriptionCache = { companyId, plan, fetchedAt: Date.now() };
}

export function useCapabilities(): UseCapabilitiesReturn {
  const { user, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [subLoading, setSubLoading] = useState(false);

  const companyId = user?.companyId ?? "";
  const role = user?.role ?? "unauthenticated";

  useEffect(() => {
    if (!companyId) {
      setPlan(DEFAULT_PLAN);
      return;
    }

    const cached = getCachedPlan(companyId);
    if (cached != null) {
      setPlan(cached);
      setSubLoading(false);
      return;
    }

    let cancelled = false;
    setSubLoading(true);

    const fetchSubscription = async () => {
      try {
        const ref = doc(db, "companies", companyId, "subscription", "current");
        const snap = await getDoc(ref);

        const resolved = snap.exists()
          ? ((snap.data() as Partial<CompanySubscription>).plan ?? DEFAULT_PLAN)
          : DEFAULT_PLAN;

        if (!cancelled) {
          setPlan(resolved);
          setCachedPlan(companyId, resolved);
        }
      } catch (err) {
        console.warn("[useCapabilities] Failed to fetch subscription:", err);
        if (!cancelled) {
          setPlan(DEFAULT_PLAN);
        }
      } finally {
        if (!cancelled) {
          setSubLoading(false);
        }
      }
    };

    fetchSubscription();
    return () => { cancelled = true; };
  }, [companyId]);

  const capabilities = useMemo(() => {
    if (authLoading || subLoading || !user) return EMPTY_SET;
    return resolveCapabilities(role, plan);
  }, [role, plan, authLoading, subLoading, user]);

  const hasCapability = useCallback(
    (cap: Capability) => capabilities.has(cap),
    [capabilities],
  );

  const hasAll = useCallback(
    (caps: Capability[]) => caps.every((c) => capabilities.has(c)),
    [capabilities],
  );

  const hasAny = useCallback(
    (caps: Capability[]) => caps.some((c) => capabilities.has(c)),
    [capabilities],
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
