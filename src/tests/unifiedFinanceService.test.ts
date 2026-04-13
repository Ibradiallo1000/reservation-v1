import { describe, expect, it } from "vitest";
import { splitConfirmedEncaissementsByChannel } from "@/modules/finance/services/unifiedFinanceService";

describe("unifiedFinanceService", () => {
  it("keeps guichet mobile money in the guichet bucket when channel says guichet", () => {
    const split = splitConfirmedEncaissementsByChannel([
      {
        type: "payment_received",
        status: "confirmed",
        amount: 10000,
        paymentChannel: "guichet",
        paymentMethod: "mobile_money",
      },
      {
        type: "payment_received",
        status: "confirmed",
        amount: 20000,
        paymentChannel: "online",
        paymentMethod: "mobile_money",
      },
      {
        type: "payment_received",
        status: "confirmed",
        amount: 5000,
        paymentMethod: "cash",
      },
    ]);

    expect(split.guichet).toBe(15000);
    expect(split.online).toBe(20000);
    expect(split.total).toBe(35000);
  });
});
