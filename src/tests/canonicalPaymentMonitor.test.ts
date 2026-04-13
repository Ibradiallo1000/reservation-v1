import { describe, expect, it } from "vitest";
import {
  isCanonicalLedgerFailedPayment,
  isCanonicalLedgerPendingPayment,
  isCanonicalOnlinePaymentToMonitor,
  isCanonicalPendingOperatorPayment,
  mapCanonicalPaymentMonitorRow,
} from "@/modules/finance/payments/canonicalPaymentMonitor";

describe("canonicalPaymentMonitor", () => {
  it("normalizes sarali payment docs as online mobile money workflow", () => {
    const row = mapCanonicalPaymentMonitorRow("pay-sarali-1", {
      companyId: "comp-1",
      agencyId: "ag-1",
      provider: "Sarali",
      status: "pending",
      ledgerStatus: "pending",
      amount: "25000",
    });

    expect(row.provider).toBe("sarali");
    expect(row.channel).toBe("online");
    expect(row.amount).toBe(25000);
    expect(isCanonicalPendingOperatorPayment(row)).toBe(true);
    expect(isCanonicalOnlinePaymentToMonitor(row)).toBe(true);
  });

  it("keeps ledger pending and failed states distinct", () => {
    const pendingRow = mapCanonicalPaymentMonitorRow("pay-validated-1", {
      channel: "online",
      provider: "wave",
      status: "validated",
      ledgerStatus: "pending",
      amount: 12000,
    });
    const failedRow = mapCanonicalPaymentMonitorRow("pay-failed-1", {
      channel: "online",
      provider: "orange",
      status: "validated",
      ledgerStatus: "failed",
      amount: 18000,
    });

    expect(isCanonicalLedgerPendingPayment(pendingRow)).toBe(true);
    expect(isCanonicalLedgerFailedPayment(pendingRow)).toBe(false);
    expect(isCanonicalLedgerFailedPayment(failedRow)).toBe(true);
    expect(isCanonicalOnlinePaymentToMonitor(failedRow)).toBe(true);
  });
});
