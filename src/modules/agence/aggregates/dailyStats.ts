// src/modules/agence/aggregates/dailyStats.ts
// Phase 4.5: Update dailyStats inside the same transaction as the triggering operation.
// All updates use a single set(..., { merge: true }) with increment() to avoid double increments.
import type { Transaction } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { doc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const COLLECTION = "dailyStats";

/** Format timestamp as YYYY-MM-DD for dailyStats document ID. */
export function toDailyStatsDate(t: Timestamp): string {
  const d = t.toDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dailyStatsRef(companyId: string, agencyId: string, date: string) {
  return doc(db, `companies/${companyId}/agences/${agencyId}/${COLLECTION}/${date}`);
}

/** Base fields for merge (increment(0) initializes missing fields to 0). */
function baseIncrements() {
  return {
    totalRevenue: increment(0),
    ticketRevenue: increment(0),
    courierRevenue: increment(0),
    ticketRevenueAgency: increment(0),
    ticketRevenueCompany: increment(0),
    courierRevenueAgency: increment(0),
    courierRevenueCompany: increment(0),
    totalPassengers: increment(0),
    totalSeats: increment(0),
    validatedSessions: increment(0),
    activeSessions: increment(0),
    closedSessions: increment(0),
    boardingClosedCount: increment(0),
  };
}

/**
 * Call from within a transaction when a reservation is created.
 * Increments totalPassengers and totalSeats for the given date.
 */
export function updateDailyStatsOnReservationCreated(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  passengers: number,
  seats: number
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    totalPassengers: increment(passengers),
    totalSeats: increment(seats),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Call from within a transaction when a session moves to CLOSED.
 */
export function updateDailyStatsOnSessionClosed(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    closedSessions: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Call when a guichet session is validated by agency accountant (VALIDATED_AGENCY).
 * Updates agency-level stats only: ticketRevenueAgency.
 */
export function updateDailyStatsOnSessionValidatedByAgency(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  ticketRevenue: number
): void {
  if (ticketRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    ticketRevenueAgency: increment(ticketRevenue),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Call when a guichet session is validated by head accountant (VALIDATED).
 * Updates company-level stats: ticketRevenueCompany, totalRevenue.
 */
export function updateDailyStatsOnSessionValidatedByCompany(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  ticketRevenue: number
): void {
  if (ticketRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    ticketRevenueCompany: increment(ticketRevenue),
    ticketRevenue: increment(ticketRevenue),
    totalRevenue: increment(ticketRevenue),
    validatedSessions: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * @deprecated Use updateDailyStatsOnSessionValidatedByAgency + ByCompany (two-level validation).
 * Call from within a transaction when a guichet session becomes VALIDATED (legacy single-step).
 */
export function updateDailyStatsOnSessionValidated(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  ticketRevenue: number
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    ticketRevenue: increment(ticketRevenue),
    totalRevenue: increment(ticketRevenue),
    validatedSessions: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Call from within a transaction when a single reservation transitions to confirme/paye (online only).
 * Increments ticketRevenue and totalRevenue by `amount`. Use for en_ligne reservations; guichet
 * revenue is added via updateDailyStatsOnSessionValidated. Idempotency: call only once per
 * reservation (caller must set ticketRevenueCountedInDailyStats on the reservation).
 */
export function addTicketRevenueToDailyStats(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  amount: number
): void {
  if (amount <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    ticketRevenue: increment(amount),
    totalRevenue: increment(amount),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Call from within a transaction when a courier session becomes VALIDATED.
 * Adds courier revenue (paid shipments only) and total revenue.
 */
export function updateDailyStatsOnCourierSessionValidated(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  courierRevenue: number
): void {
  if (courierRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    courierRevenue: increment(courierRevenue),
    totalRevenue: increment(courierRevenue),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Format a date for dailyStats document ID (YYYY-MM-DD). Accepts Firestore Timestamp or Date. */
export function formatDateForDailyStats(value: unknown): string {
  let d: Date;
  if (!value) {
    d = new Date();
  } else if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    d = (value as { toDate: () => Date }).toDate();
  } else if (value instanceof Date) {
    d = value;
  } else if (typeof value === "string") {
    d = new Date(value);
  } else {
    d = new Date();
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Call from within a transaction when boarding is closed.
 */
export function updateDailyStatsOnBoardingClosed(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    boardingClosedCount: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
