import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentReference, Transaction } from "firebase/firestore";

const mocks = vi.hoisted(() => ({
  addTicketRevenueToDailyStats: vi.fn(),
  writeOnlineTicketActivityInTransaction: vi.fn(),
}));

vi.mock("@/firebaseConfig", () => ({ db: {} }));

vi.mock("@/modules/agence/aggregates/dailyStats", () => ({
  addTicketRevenueToDailyStats: mocks.addTicketRevenueToDailyStats,
  dailyStatsTimezoneFromAgencyData: vi.fn(() => "Africa/Bamako"),
  formatDateForDailyStats: vi.fn(() => "2026-06-10"),
}));

vi.mock("@/modules/compagnie/activity/activityLogsService", () => ({
  activityLogDocIdOnline: vi.fn((reservationId: string) => `online_${reservationId}`),
  activityLogRef: vi.fn(() => ({ path: "activityLogs/online_res-1" })),
  writeOnlineTicketActivityInTransaction: mocks.writeOnlineTicketActivityInTransaction,
}));

import {
  isValidOnlineTicketActivityLog,
  recordOnlineReservationCommercialActivityInTransaction,
} from "./reservationStatutService";

const tx = {} as Transaction;
const reservationRef = { id: "res-1" } as DocumentReference;
const onlineReservation = {
  companyId: "company-1",
  agencyId: "agency-1",
  canal: "en_ligne",
  montant: 12_500,
  date: "2026-06-10",
  seatsGo: 2,
  depart: "Bamako",
  arrivee: "Segou",
};

describe("recordOnlineReservationCommercialActivityInTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records dailyStats and the deterministic online activity log on first validation", () => {
    const patch = recordOnlineReservationCommercialActivityInTransaction({
      tx,
      reservationRef,
      data: onlineReservation,
      agencyTimezone: "Africa/Bamako",
      activityLogAlreadyValid: false,
    });

    expect(mocks.addTicketRevenueToDailyStats).toHaveBeenCalledWith(
      tx,
      "company-1",
      "agency-1",
      "2026-06-10",
      12_500,
      "Africa/Bamako"
    );
    expect(mocks.writeOnlineTicketActivityInTransaction).toHaveBeenCalledWith(tx, {
      companyId: "company-1",
      agencyId: "agency-1",
      reservationId: "res-1",
      amount: 12_500,
      seats: 2,
      depart: "Bamako",
      arrivee: "Segou",
    });
    expect(patch).toEqual({ ticketRevenueCountedInDailyStats: true });
  });

  it("does not duplicate either accounting write when both idempotence markers exist", () => {
    const patch = recordOnlineReservationCommercialActivityInTransaction({
      tx,
      reservationRef,
      data: { ...onlineReservation, ticketRevenueCountedInDailyStats: true },
      agencyTimezone: "Africa/Bamako",
      activityLogAlreadyValid: true,
    });

    expect(mocks.addTicketRevenueToDailyStats).not.toHaveBeenCalled();
    expect(mocks.writeOnlineTicketActivityInTransaction).not.toHaveBeenCalled();
    expect(patch).toEqual({});
  });

  it("recreates a missing activity log without incrementing dailyStats again", () => {
    const patch = recordOnlineReservationCommercialActivityInTransaction({
      tx,
      reservationRef,
      data: { ...onlineReservation, ticketRevenueCountedInDailyStats: true },
      agencyTimezone: "Africa/Bamako",
      activityLogAlreadyValid: false,
    });

    expect(mocks.addTicketRevenueToDailyStats).not.toHaveBeenCalled();
    expect(mocks.writeOnlineTicketActivityInTransaction).toHaveBeenCalledOnce();
    expect(patch).toEqual({});
  });

  it("treats malformed existing online activity logs as invalid", () => {
    expect(isValidOnlineTicketActivityLog({ type: "ticket", source: "guichet", status: "confirmed" })).toBe(false);
    expect(isValidOnlineTicketActivityLog({ type: "online", source: "online", status: "confirmed" })).toBe(true);
  });

  it("does not account a guichet reservation", () => {
    const patch = recordOnlineReservationCommercialActivityInTransaction({
      tx,
      reservationRef,
      data: { ...onlineReservation, canal: "guichet" },
      agencyTimezone: "Africa/Bamako",
      activityLogAlreadyValid: false,
    });

    expect(mocks.addTicketRevenueToDailyStats).not.toHaveBeenCalled();
    expect(mocks.writeOnlineTicketActivityInTransaction).not.toHaveBeenCalled();
    expect(patch).toEqual({});
  });
});
