/**
 * Teliya SaaS – Subscription Guard Hook
 *
 * Provides a simple hook for components that need to check
 * if the current company can perform an action.
 *
 * Works entirely on the frontend via the AuthContext company data.
 * No Cloud Function dependency. Spark-compatible.
 */
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { canCompanyPerformAction, needsPaymentAttention } from "./restrictions";
import type { SubscriptionStatus, CompanyAction, ActionResult } from "./types";

interface SubscriptionGuardResult {
  subscriptionStatus: SubscriptionStatus;
  checkAction: (action: CompanyAction) => ActionResult;
  needsAttention: boolean;
  isOperational: boolean;
}

/**
 * Hook that returns subscription status helpers for the current company.
 * Falls back to "active" if no subscription data is available.
 */
export function useSubscriptionGuard(): SubscriptionGuardResult {
  const { company } = useAuth() as { company: Record<string, unknown> | null };

  const subscriptionStatus = useMemo<SubscriptionStatus>(() => {
    if (!company) return "active";
    const status = (company.subscriptionStatus as string) ?? "active";
    const valid: SubscriptionStatus[] = ["trial", "active", "grace", "restricted", "suspended"];
    return valid.includes(status as SubscriptionStatus)
      ? (status as SubscriptionStatus)
      : "active";
  }, [company]);

  const checkAction = useMemo(
    () => (action: CompanyAction) => canCompanyPerformAction(subscriptionStatus, action),
    [subscriptionStatus],
  );

  const needsAttention = useMemo(
    () => needsPaymentAttention(subscriptionStatus),
    [subscriptionStatus],
  );

  const isOperational = useMemo(
    () => subscriptionStatus === "trial" || subscriptionStatus === "active" || subscriptionStatus === "grace",
    [subscriptionStatus],
  );

  return { subscriptionStatus, checkAction, needsAttention, isOperational };
}
