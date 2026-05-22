// src/core/subscription/types.ts
// Firestore source of truth: companies/{companyId}

import type { Timestamp } from "firebase/firestore";
import type { Plan } from "./plans";

export type SubscriptionStatus = "trial" | "active" | "grace" | "restricted" | "suspended";

export interface CompanySubscription {
  plan: Plan;
  subscriptionStatus: SubscriptionStatus;
  updatedAt?: Timestamp | null;
}

export const DEFAULT_PLAN: Plan = "standard";

export const SUBSCRIPTION_PATH = (companyId: string) =>
  `companies/${companyId}` as const;
