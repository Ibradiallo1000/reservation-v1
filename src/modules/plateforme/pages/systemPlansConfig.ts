export type SystemPlanId = "standard" | "premium";

export type SystemPlanValues = {
  price: number;
  includedOperations: number;
  overage: number;
};

export type SystemPlanDefinition = SystemPlanValues & {
  id: SystemPlanId;
  name: "STANDARD" | "PREMIUM";
};

export type SystemPlansConfig = Record<SystemPlanId, SystemPlanDefinition>;

export const SYSTEM_PLANS_DEFAULTS: SystemPlansConfig = {
  standard: {
    id: "standard",
    name: "STANDARD",
    price: 100000,
    includedOperations: 3000,
    overage: 15,
  },
  premium: {
    id: "premium",
    name: "PREMIUM",
    price: 300000,
    includedOperations: 10000,
    overage: 10,
  },
};

export const PLAN_KEYS = ["standard", "premium"] as const satisfies readonly SystemPlanId[];
