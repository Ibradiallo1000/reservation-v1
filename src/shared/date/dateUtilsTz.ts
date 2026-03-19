/**
 * Date "aujourd'hui" et plages de dates dans le fuseau Africa/Bamako.
 * Utiliser ces helpers pour toutes les stats "aujourd'hui" (réservations, CA, bus)
 * afin d'éviter les décalages à minuit (UTC vs local).
 */

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const TZ_BAMAKO = "Africa/Bamako";

/**
 * Retourne la date du jour au format YYYY-MM-DD dans le fuseau Africa/Bamako.
 * À utiliser pour : reservationsToday, billets aujourd'hui, CA aujourd'hui, bus du jour.
 */
export function getTodayBamako(): string {
  return dayjs().tz(TZ_BAMAKO).format("YYYY-MM-DD");
}

/**
 * Retourne le début de la journée (00:00:00) en Bamako, en objet Date pour comparaisons.
 */
export function getStartOfDayBamako(): Date {
  return dayjs().tz(TZ_BAMAKO).startOf("day").toDate();
}

/**
 * Retourne la fin de la journée (23:59:59.999) en Bamako, en objet Date pour comparaisons.
 */
export function getEndOfDayBamako(): Date {
  return dayjs().tz(TZ_BAMAKO).endOf("day").toDate();
}

/**
 * Pour une date YYYY-MM-DD, retourne le début de la journée (00:00:00) en Africa/Bamako.
 * Utilisé pour les plages de période (semaine, mois) en createdAt.
 */
export function getStartOfDayInBamako(dateStr: string): Date {
  return dayjs.tz(`${dateStr}T00:00:00`, TZ_BAMAKO).toDate();
}

/**
 * Pour une date YYYY-MM-DD, retourne la fin de la journée (23:59:59.999) en Africa/Bamako.
 */
export function getEndOfDayInBamako(dateStr: string): Date {
  return dayjs.tz(`${dateStr}T23:59:59.999`, TZ_BAMAKO).toDate();
}

/**
 * Normalise une chaîne en date stricte YYYY-MM-DD (sans espace, sans timezone).
 * À utiliser pour paidAt et pour dateFrom/dateTo des requêtes cash.
 * Si la chaîne contient déjà YYYY-MM-DD au début, le retourne ; sinon tente un parse.
 */
export function normalizeDateToYYYYMMDD(value: string | null | undefined): string {
  const s = (value ?? "").trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const parsed = dayjs(s, ["YYYY-MM-DD", "DD/MM/YYYY", "YYYY/MM/DD"], true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  return s.slice(0, 10);
}
