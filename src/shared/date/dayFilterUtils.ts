/**
 * Sélecteur de jour unique : Aujourd'hui, Hier, Personnalisé.
 * Utilisé pour les vues escale (bus du jour, caisse, ventes) pour consulter une date précise.
 */

export type DayPreset = "today" | "yesterday" | "custom";

export const DAY_PRESET_LABELS: Record<DayPreset, string> = {
  today: "Aujourd'hui",
  yesterday: "Hier",
  custom: "Personnalisé",
};

/** Retourne la date du jour au format YYYY-MM-DD. */
export function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Calcule la date sélectionnée (YYYY-MM-DD) à partir du preset et de la date personnalisée. */
export function getSelectedDateStr(preset: DayPreset, customDate: string): string {
  const now = new Date();
  switch (preset) {
    case "today":
      return toLocalDateStr(now);
    case "yesterday": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return toLocalDateStr(yesterday);
    }
    case "custom":
      return customDate || toLocalDateStr(now);
    default:
      return toLocalDateStr(now);
  }
}
