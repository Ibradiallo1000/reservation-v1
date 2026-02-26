/**
 * Périodes réutilisables pour les vues données société : semaine, mois, année en cours, personnalisé.
 * Utilisé partout où on affiche des données (trésorerie, finances, centre de commande, etc.).
 */
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isWithinInterval,
} from "date-fns";
import { fr } from "date-fns/locale";

export type PeriodKind = "day" | "week" | "month" | "year" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

const weekOpts = { weekStartsOn: 1 as 0 | 1 | 2 | 3 | 4 | 5 | 6, locale: fr };

/** Calcule les bornes de la période (semaine / mois / année en cours, ou personnalisé). */
export function getDateRangeForPeriod(
  kind: PeriodKind,
  refDate: Date = new Date(),
  customStart?: string,
  customEnd?: string
): DateRange {
  const now = new Date(refDate.getTime());
  if (kind === "custom" && customStart && customEnd) {
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  switch (kind) {
    case "day": {
      const start = startOfDay(now);
      const end = endOfDay(now);
      return { start, end };
    }
    case "week": {
      const start = startOfWeek(now, weekOpts);
      const end = endOfWeek(now, weekOpts);
      return { start, end };
    }
    case "month": {
      const start = startOfMonth(now);
      const end = endOfMonth(now);
      return { start, end };
    }
    case "year": {
      const start = startOfYear(now);
      const end = endOfYear(now);
      return { start, end };
    }
    default:
      return getDateRangeForPeriod("month", now);
  }
}

/** Retourne true si une date (timestamp ms ou Date) est dans l'intervalle. */
export function isInRange(t: Date | number, range: DateRange): boolean {
  const d = typeof t === "number" ? new Date(t) : t;
  return isWithinInterval(d, { start: range.start, end: range.end });
}

/** Libellé court pour la période (pour affichage). */
export function getPeriodLabel(
  kind: PeriodKind,
  range: DateRange,
  customStart?: string,
  customEnd?: string
): string {
  if (kind === "custom" && customStart && customEnd) {
    return `${new Date(customStart).toLocaleDateString("fr-FR")} → ${new Date(customEnd).toLocaleDateString("fr-FR")}`;
  }
  return `${range.start.toLocaleDateString("fr-FR")} → ${range.end.toLocaleDateString("fr-FR")}`;
}
