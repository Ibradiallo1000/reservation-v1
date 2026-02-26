/**
 * Teliya SaaS – Feature Restriction Engine
 *
 * Centralized helper: canCompanyPerformAction(subscriptionStatus, action)
 *
 * Rules:
 *   TRIAL      -> allow everything
 *   ACTIVE     -> allow everything
 *   GRACE      -> allow but with warning
 *   RESTRICTED -> block creation, allow dashboard
 *   SUSPENDED  -> block everything except payment
 */
import type { SubscriptionStatus, CompanyAction, ActionResult } from "./types";

/* ====================================================================
   PERMISSION MATRIX
==================================================================== */

type PermissionLevel = "allow" | "warn" | "block";

const PERMISSION_MATRIX: Record<SubscriptionStatus, Record<CompanyAction, PermissionLevel>> = {
  trial: {
    CREATE_RESERVATION:   "allow",
    CREATE_AGENCY:        "allow",
    ACCESS_DASHBOARD:     "allow",
    RECEIVE_ONLINE_BOOKING: "allow",
    MANAGE_SETTINGS:      "allow",
  },
  active: {
    CREATE_RESERVATION:   "allow",
    CREATE_AGENCY:        "allow",
    ACCESS_DASHBOARD:     "allow",
    RECEIVE_ONLINE_BOOKING: "allow",
    MANAGE_SETTINGS:      "allow",
  },
  grace: {
    CREATE_RESERVATION:   "warn",
    CREATE_AGENCY:        "warn",
    ACCESS_DASHBOARD:     "warn",
    RECEIVE_ONLINE_BOOKING: "warn",
    MANAGE_SETTINGS:      "warn",
  },
  restricted: {
    CREATE_RESERVATION:   "block",
    CREATE_AGENCY:        "block",
    ACCESS_DASHBOARD:     "allow",
    RECEIVE_ONLINE_BOOKING: "block",
    MANAGE_SETTINGS:      "allow",
  },
  suspended: {
    CREATE_RESERVATION:   "block",
    CREATE_AGENCY:        "block",
    ACCESS_DASHBOARD:     "block",
    RECEIVE_ONLINE_BOOKING: "block",
    MANAGE_SETTINGS:      "block",
  },
};

/* ====================================================================
   WARNING MESSAGES
==================================================================== */

const GRACE_WARNING =
  "Votre abonnement a expiré. Veuillez effectuer un paiement pour éviter la restriction de votre compte.";

const RESTRICTED_REASON =
  "Votre compte est restreint. La création de réservations et d'agences est désactivée. Veuillez régulariser votre paiement.";

const SUSPENDED_REASON =
  "Votre compte est suspendu. Seul l'accès au paiement est disponible. Contactez le support Teliya.";

/* ====================================================================
   MAIN FUNCTION
==================================================================== */

/**
 * Determine if a company can perform a given action based on its subscription status.
 *
 * @param subscriptionStatus - Current subscription status of the company
 * @param action - The action the company wants to perform
 * @returns ActionResult with allowed/warning/reason
 */
export function canCompanyPerformAction(
  subscriptionStatus: SubscriptionStatus | undefined | null,
  action: CompanyAction,
): ActionResult {
  const status: SubscriptionStatus = subscriptionStatus ?? "active";
  const permission = PERMISSION_MATRIX[status]?.[action] ?? "block";

  switch (permission) {
    case "allow":
      return { allowed: true };

    case "warn":
      return {
        allowed: true,
        warning: GRACE_WARNING,
      };

    case "block":
      return {
        allowed: false,
        reason: status === "suspended" ? SUSPENDED_REASON : RESTRICTED_REASON,
      };

    default:
      return { allowed: false, reason: "Action non autorisée." };
  }
}

/**
 * Quick check: is the company in a usable state?
 */
export function isCompanyOperational(
  subscriptionStatus: SubscriptionStatus | undefined | null,
): boolean {
  const status = subscriptionStatus ?? "active";
  return status === "trial" || status === "active" || status === "grace";
}

/**
 * Check if subscription needs attention (grace or worse).
 */
export function needsPaymentAttention(
  subscriptionStatus: SubscriptionStatus | undefined | null,
): boolean {
  const status = subscriptionStatus ?? "active";
  return status === "grace" || status === "restricted" || status === "suspended";
}
