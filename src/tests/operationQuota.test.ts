import { describe, expect, it } from "vitest";
import { getOperationQuotaStatus } from "@/core/subscription/operationQuota";

function currentBillingMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

describe("operation quota status", () => {
  it("keeps current usage when the stored month is current", () => {
    const status = getOperationQuotaStatus({
      plan: "standard",
      currentMonth: currentBillingMonth(),
      currentMonthOperations: 11,
    });

    expect(status.currentMonthOperations).toBe(11);
    expect(status.canPerform).toBe(true);
  });

  it("resets displayed usage when the stored month is stale", () => {
    const status = getOperationQuotaStatus({
      plan: "standard",
      currentMonth: "2020-01",
      currentOperationsMonth: "2020-01",
      currentMonthOperations: 11,
    });

    expect(status.currentMonthOperations).toBe(0);
    expect(status.usageRatio).toBe(0);
    expect(status.canPerform).toBe(true);
  });
});
