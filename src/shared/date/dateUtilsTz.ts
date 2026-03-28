/**
 * Dates « jour agence » et plages de période dans un fuseau IANA (ex. Africa/Bamako).
 * Les timestamps Firestore (performedAt, createdAt) restent en UTC côté stockage ;
 * seules les bornes de requêtes et les clés YYYY-MM-DD « métier » utilisent le fuseau agence.
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** @deprecated Préférer DEFAULT_AGENCY_TIMEZONE pour les nouveaux appels. */
export const TZ_BAMAKO = "Africa/Bamako";

/** Fuseau par défaut si `agency.timezone` est absent ou invalide (rétrocompat Mali). */
export const DEFAULT_AGENCY_TIMEZONE = TZ_BAMAKO;

/**
 * Lit `timezone` sur le document agence (IANA). Valeur invalide ou vide → défaut Bamako.
 */
export function resolveAgencyTimezone(source?: { timezone?: string | null } | null | undefined): string {
  const raw = source?.timezone?.trim();
  if (!raw) return DEFAULT_AGENCY_TIMEZONE;
  const probe = dayjs.tz("2020-06-15T12:00:00", raw);
  if (!probe.isValid()) return DEFAULT_AGENCY_TIMEZONE;
  return raw;
}

/**
 * Normalise une chaîne en date stricte YYYY-MM-DD (sans espace, sans timezone).
 * Utile pour bornes `dateFrom`/`dateTo` passées à `getCashTransactionsByPaidAtRange` (filtre réel = `createdAt`).
 */
export function normalizeDateToYYYYMMDD(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const parsed = dayjs(s, ["YYYY-MM-DD", "DD/MM/YYYY", "YYYY/MM/DD"], true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  return s.slice(0, 10);
}

/** Aujourd'hui (calendrier) dans le fuseau donné. */
export function getTodayForTimezone(ianaTimezone: string): string {
  return dayjs().tz(ianaTimezone).format("YYYY-MM-DD");
}

/** Début du jour courant dans le fuseau donné. */
export function getStartOfDay(ianaTimezone: string): Date {
  return dayjs().tz(ianaTimezone).startOf("day").toDate();
}

/** Fin du jour courant dans le fuseau donné (23:59:59.999). */
export function getEndOfDay(ianaTimezone: string): Date {
  return dayjs().tz(ianaTimezone).endOf("day").toDate();
}

/** Début du jour calendaire `dateStr` (YYYY-MM-DD) dans le fuseau donné. */
export function getStartOfDayForDate(dateStr: string, ianaTimezone: string): Date {
  const d = normalizeDateToYYYYMMDD(dateStr);
  return dayjs.tz(`${d}T00:00:00`, ianaTimezone).toDate();
}

/** Fin du jour calendaire `dateStr` (YYYY-MM-DD) dans le fuseau donné. */
export function getEndOfDayForDate(dateStr: string, ianaTimezone: string): Date {
  const d = normalizeDateToYYYYMMDD(dateStr);
  return dayjs.tz(`${d}T23:59:59.999`, ianaTimezone).toDate();
}

/** Clé calendaire YYYY-MM-DD en UTC (indépendant du fuseau local) — ex. champs dérivés d’un instant. */
export function formatDateKeyUtcFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Clé YYYY-MM-DD pour une Date instantanée, vue dans le fuseau donné. */
export function getDateKeyInTimezone(d: Date, ianaTimezone: string): string {
  return dayjs(d).tz(ianaTimezone).format("YYYY-MM-DD");
}

/** Heure 0–23 pour une Date instantanée, vue dans le fuseau donné. */
export function getHourInTimezone(d: Date, ianaTimezone: string): number {
  return dayjs(d).tz(ianaTimezone).hour();
}

// ——— Compatibilité : anciens noms « Bamako » = défaut historique ———

export function getTodayBamako(): string {
  return getTodayForTimezone(TZ_BAMAKO);
}

export function getStartOfDayBamako(): Date {
  return getStartOfDay(TZ_BAMAKO);
}

export function getEndOfDayBamako(): Date {
  return getEndOfDay(TZ_BAMAKO);
}

export function getStartOfDayInBamako(dateStr: string): Date {
  return getStartOfDayForDate(dateStr, TZ_BAMAKO);
}

export function getEndOfDayInBamako(dateStr: string): Date {
  return getEndOfDayForDate(dateStr, TZ_BAMAKO);
}
