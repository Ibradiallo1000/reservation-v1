// src/modules/agence/aggregates/dailyStats.ts
// Phase 4.5: Update dailyStats inside the same transaction as the triggering operation.
// All updates use a single set(..., { merge: true }) with increment() to avoid double increments.
import type { Transaction } from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { doc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { DEFAULT_AGENCY_TIMEZONE, resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";

dayjs.extend(utc);
dayjs.extend(timezone);

const COLLECTION = "dailyStats";

/**
 * Champs d’identité écrits sur chaque merge dailyStats.
 * `timezone` (IANA) est optionnel mais recommandé : même fuseau que celui utilisé pour calculer `date` (id document).
 */
function dailyStatsIdentity(
  companyId: string,
  agencyId: string,
  date: string,
  ianaTimezone?: string
): Record<string, unknown> {
  return {
    companyId,
    agencyId,
    date,
    ...(ianaTimezone ? { timezone: ianaTimezone } : {}),
  };
}

/**
 * Clé document dailyStats/{YYYY-MM-DD} : instant Firestore interprété dans le fuseau de l’agence.
 * Doit être identique en lecture (UI) et en écriture (transactions).
 */
export function timestampToDailyStatsDateKey(ts: Timestamp, ianaTimezone: string): string {
  return dayjs(ts.toDate()).tz(ianaTimezone).format("YYYY-MM-DD");
}

/** @deprecated Utiliser timestampToDailyStatsDateKey(ts, tz) — équivalent défaut Bamako. */
export function toDailyStatsDate(t: Timestamp): string {
  return timestampToDailyStatsDateKey(t, DEFAULT_AGENCY_TIMEZONE);
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
  seats: number,
  ianaTimezone?: string
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
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
  date: string,
  ianaTimezone?: string
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
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
  ticketRevenue: number,
  ianaTimezone?: string
): void {
  if (ticketRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
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
  ticketRevenue: number,
  ianaTimezone?: string
): void {
  if (ticketRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
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
  ticketRevenue: number,
  ianaTimezone?: string
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
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
 * Guichet : revenus via validation session (`updateDailyStatsOnSessionValidated*`).
 */
export function addTicketRevenueToDailyStats(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  amount: number,
  ianaTimezone?: string
): void {
  if (amount <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
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
  courierRevenue: number,
  ianaTimezone?: string
): void {
  if (courierRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
    ...baseIncrements(),
    courierRevenue: increment(courierRevenue),
    totalRevenue: increment(courierRevenue),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Comptable agence a validé la session courrier (VALIDATED_AGENCY). */
export function updateDailyStatsOnCourierSessionValidatedByAgency(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  courierRevenue: number,
  ianaTimezone?: string
): void {
  if (courierRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
    ...baseIncrements(),
    courierRevenueAgency: increment(courierRevenue),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Chef d'agence : VALIDATED_AGENCY → VALIDATED (revenus compagnie / total). */
export function updateDailyStatsOnCourierSessionValidatedByCompany(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  courierRevenue: number,
  ianaTimezone?: string
): void {
  if (courierRevenue <= 0) return;
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
    ...baseIncrements(),
    courierRevenue: increment(courierRevenue),
    courierRevenueCompany: increment(courierRevenue),
    totalRevenue: increment(courierRevenue),
    validatedSessions: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Clé YYYY-MM-DD pour dailyStats à partir d’un instant (Timestamp / Date / string) dans le fuseau agence.
 */
export function formatDateForDailyStats(value: unknown, ianaTimezone: string = DEFAULT_AGENCY_TIMEZONE): string {
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
  return dayjs(d).tz(ianaTimezone).format("YYYY-MM-DD");
}

/** Fuseau agence depuis le document Firestore `agences/{id}` (lecture transaction ou getDoc). */
export function dailyStatsTimezoneFromAgencyData(data: { timezone?: string | null } | undefined): string {
  return resolveAgencyTimezone(data ?? null);
}

/**
 * Call from within a transaction when boarding is closed.
 */
export function updateDailyStatsOnBoardingClosed(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  date: string,
  ianaTimezone?: string
): void {
  const ref = dailyStatsRef(companyId, agencyId, date);
  tx.set(ref, {
    ...dailyStatsIdentity(companyId, agencyId, date, ianaTimezone),
    ...baseIncrements(),
    boardingClosedCount: increment(1),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
