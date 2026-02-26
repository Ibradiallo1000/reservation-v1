/**
 * Teliya SaaS – Subscription Module
 * Central export for all subscription-related logic.
 */

// Types
export type {
  SubscriptionStatus,
  SupportLevel,
  PlanType,
  PaymentMethod,
  PaymentStatus,
  CompanyAction,
  PlanDoc,
  SubscriptionSnapshot,
  SubscriptionObject,
  CompanySubscriptionFields,
  PaymentDoc,
  ActionResult,
} from "./types";

// Lifecycle
export {
  GRACE_PERIOD_DAYS,
  BILLING_PERIOD_DAYS,
  isValidTransition,
  getExpirationTarget,
  getPaymentActivationTarget,
  STATUS_LABELS,
  STATUS_COLORS,
} from "./lifecycle";

// Restrictions
export {
  canCompanyPerformAction,
  isCompanyOperational,
  needsPaymentAttention,
} from "./restrictions";

// Revenue
export {
  calculateDigitalFee,
  calculateNetAmount,
  buildRevenueSummary,
} from "./revenue";
export type { RevenueSummary } from "./revenue";

// UI Components
export { default as SubscriptionBanner } from "./SubscriptionBanner";

// Hooks
export { useSubscriptionGuard } from "./useSubscriptionGuard";
