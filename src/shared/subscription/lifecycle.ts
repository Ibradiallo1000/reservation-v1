/**
 * Teliya SaaS – Subscription Lifecycle Engine
 *
 * Defines the definitive subscription status transitions:
 *   TRIAL -> GRACE -> RESTRICTED -> SUSPENDED
 *   ACTIVE -> GRACE -> RESTRICTED -> SUSPENDED
 *
 * Used by Cloud Functions (server) and frontend (display only).
 */
import type { SubscriptionStatus } from "./types";

/* ====================================================================
   CONSTANTS
==================================================================== */

export const GRACE_PERIOD_DAYS = 7;
export const BILLING_PERIOD_DAYS = 30;

/* ====================================================================
   VALID TRANSITIONS MAP
==================================================================== */

const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trial:      ["active", "grace"],
  active:     ["grace", "suspended"],
  grace:      ["active", "restricted"],
  restricted: ["active", "suspended"],
  suspended:  ["active"],
};

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get the next status when a subscription expires without payment.
 */
export function getExpirationTarget(current: SubscriptionStatus): SubscriptionStatus | null {
  switch (current) {
    case "trial":
      return "grace";
    case "active":
      return "grace";
    case "grace":
      return "restricted";
    case "restricted":
      return "suspended";
    case "suspended":
      return null;
    default:
      return null;
  }
}

/**
 * Get the next status when a valid payment is received.
 */
export function getPaymentActivationTarget(
  current: SubscriptionStatus,
): SubscriptionStatus {
  return "active";
}

/* ====================================================================
   HUMAN-READABLE LABELS
==================================================================== */

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial:      "Essai",
  active:     "Actif",
  grace:      "Grace",
  restricted: "Restreint",
  suspended:  "Suspendu",
};

export const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  trial:      "bg-amber-100 text-amber-700",
  active:     "bg-green-100 text-green-700",
  grace:      "bg-orange-100 text-orange-700",
  restricted: "bg-red-100 text-red-700",
  suspended:  "bg-gray-100 text-gray-700",
};
