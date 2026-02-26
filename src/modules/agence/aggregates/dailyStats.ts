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
 * Call from within a transaction when a session becomes VALIDATED.
 * Adds totalRevenue from the shift/report.
 */
export function updateDailyStatsOnSessionValidated(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  totalRevenue: number
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    companyId,
    agencyId,
    date,
    ...baseIncrements(),
    totalRevenue: increment(totalRevenue),
    validatedSessions: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
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
