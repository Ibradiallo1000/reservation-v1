/**
 * Utilitaires pour la comparaison avec la période précédente (CEO dashboard).
 * Aujourd'hui vs Hier, Cette semaine vs Semaine précédente, Ce mois vs Mois précédent.
 */
import dayjs from "dayjs";

export type PeriodKind = "day" | "week" | "month" | "year" | "custom";

export interface PreviousPeriodResult {
  previousStart: string;
  previousEnd: string;
  /** Label pour l'affichage : "Comparé à hier", "Comparé à la semaine dernière", etc. */
  comparisonLabel: string;
}

/**
 * Calcule la période précédente de même durée que [startDate, endDate].
 */
export function getPreviousPeriod(
  startDate: Date,
  endDate: Date,
  period: PeriodKind
): PreviousPeriodResult {
  const start = dayjs(startDate);
  const end = dayjs(endDate);
  const diffDays = end.diff(start, "day") + 1;

  const previousEnd = start.subtract(1, "day");
  const previousStart = previousEnd.subtract(diffDays - 1, "day");

  let comparisonLabel: string;
  if (period === "day") comparisonLabel = "Comparé à hier";
  else if (period === "week") comparisonLabel = "Comparé à la semaine dernière";
  else if (period === "month") comparisonLabel = "Comparé au mois précédent";
  else comparisonLabel = "Comparé à la période précédente";

  return {
    previousStart: previousStart.format("YYYY-MM-DD"),
    previousEnd: previousEnd.format("YYYY-MM-DD"),
    comparisonLabel,
  };
}

/**
 * Calcule la variation en pourcentage (arrondi à 1 décimale).
 * Retourne une chaîne pour affichage : "+12 %", "-8 %", "0 %".
 */
export function calculateChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "+100 %" : "0 %";
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded > 0) return `+${rounded} %`;
  if (rounded < 0) return `${rounded} %`;
  return "0 %";
}
