/**
 * Teliya SaaS – Subscription System Types
 * Shared between frontend and conceptually aligned with Cloud Functions.
 */

/* ====================================================================
   ENUMS & LITERALS
==================================================================== */

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "grace"
  | "restricted"
  | "suspended";

export type SupportLevel =
  | "basic"
  | "standard"
  | "priority"
  | "premium"
  | "enterprise";

export type PlanType = "trial" | "paid";

export type PaymentMethod = "invoice" | "mobile_money";

export type PaymentStatus = "pending" | "validated" | "rejected";

/* ====================================================================
   ACTION TYPES (for restriction engine)
==================================================================== */

export type CompanyAction =
  | "CREATE_RESERVATION"
  | "CREATE_AGENCY"
  | "ACCESS_DASHBOARD"
  | "RECEIVE_ONLINE_BOOKING"
  | "MANAGE_SETTINGS";

/* ====================================================================
   PLAN DOCUMENT (Firestore: /plans/{planId})
==================================================================== */

export interface PlanDoc {
  name: string;
  priceMonthly: number;
  quotaReservations: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
  isTrial?: boolean;
  trialDurationDays?: number;
  brandingLocked?: boolean;
}

/* ====================================================================
   SUBSCRIPTION SNAPSHOT (frozen at creation time)
==================================================================== */

export interface SubscriptionSnapshot {
  priceMonthly: number;
  quotaReservations: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
}

/* ====================================================================
   SUBSCRIPTION OBJECT (embedded in company document)
==================================================================== */

export interface SubscriptionObject {
  status: SubscriptionStatus;
  planId: string;
  planName: string;
  planType: PlanType;
  isFree: boolean;
  currentPeriodStart: unknown; // Timestamp
  currentPeriodEnd: unknown;   // Timestamp
  trialEndsAt?: unknown;       // Timestamp
  gracePeriodEnd?: unknown;    // Timestamp
  lastPaymentAt?: unknown;     // Timestamp
  nextBillingDate?: unknown;   // Timestamp
  paymentMethod?: PaymentMethod;
  snapshot: SubscriptionSnapshot;
}

/* ====================================================================
   COMPANY SUBSCRIPTION FIELDS (flat fields on company doc)
==================================================================== */

export interface CompanySubscriptionFields {
  subscriptionStatus: SubscriptionStatus;
  planId: string;
  plan: string;
  planType: PlanType;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
  nextBillingDate?: unknown;
  lastPaymentAt?: unknown;
  graceUntil?: unknown;
  trialEndsAt?: unknown;
  subscription: SubscriptionObject;
  // Revenue tracking
  totalDigitalRevenueGenerated?: number;
  totalDigitalFeesCollected?: number;
  totalPaymentsReceived?: number;
}

/* ====================================================================
   PAYMENT DOCUMENT (Firestore: /companies/{id}/payments/{paymentId})
==================================================================== */

export interface PaymentDoc {
  amount: number;
  method: PaymentMethod;
  periodCoveredStart: unknown; // Timestamp
  periodCoveredEnd: unknown;   // Timestamp
  createdAt: unknown;          // Timestamp
  validatedBy?: string;        // admin UID
  validatedAt?: unknown;       // Timestamp
  status: PaymentStatus;
  notes?: string;
}

/* ====================================================================
   RESTRICTION RESULT
==================================================================== */

export interface ActionResult {
  allowed: boolean;
  reason?: string;
  warning?: string;
}
