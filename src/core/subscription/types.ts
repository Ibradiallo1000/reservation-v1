// src/core/subscription/types.ts
// Firestore subscription document shape: companies/{companyId}/subscription/current

import type { Timestamp } from "firebase/firestore";
import type { Plan } from "./plans";

export type SubscriptionStatus = "trial" | "active" | "expired";

export interface CompanySubscription {
  plan: Plan;
  status: SubscriptionStatus;
  trialEndsAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const DEFAULT_PLAN: Plan = "starter";

export const SUBSCRIPTION_PATH = (companyId: string) =>
  `companies/${companyId}/subscription/current` as const;
