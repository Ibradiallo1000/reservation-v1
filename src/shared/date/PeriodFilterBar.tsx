/**
 * Barre de filtre de période réutilisable : Semaine | Mois | Année | Personnalisé.
 * À utiliser dans les vues trésorerie, finances, centre de commande, etc.
 */
import React, { useMemo } from "react";
import type { PeriodKind } from "./periodUtils";
import { getDateRangeForPeriod, getPeriodLabel } from "./periodUtils";

export interface PeriodFilterBarProps {
  period: PeriodKind;
  customStart?: string;
  customEnd?: string;
  onPeriodChange: (kind: PeriodKind, customStart?: string, customEnd?: string) => void;
  className?: string;
}

const PERIOD_OPTIONS: { kind: PeriodKind; label: string }[] = [
  { kind: "day", label: "Jour" },
  { kind: "week", label: "Semaine" },
  { kind: "month", label: "Mois" },
  { kind: "year", label: "Année" },
  { kind: "custom", label: "Personnalisé" },
];

export const PeriodFilterBar: React.FC<PeriodFilterBarProps> = ({
  period,
  customStart,
  customEnd,
  onPeriodChange,
  className = "",
}) => {
  const range = useMemo(
    () => getDateRangeForPeriod(period, new Date(), customStart, customEnd),
    [period, customStart, customEnd]
  );
  const periodLabel = getPeriodLabel(period, range, customStart, customEnd);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value as PeriodKind, customStart, customEnd)}
        className="h-9 min-w-[170px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
      >
        {PERIOD_OPTIONS.map((opt) => (
          <option key={opt.kind} value={opt.kind}>
            {opt.label}
          </option>
        ))}
      </select>
      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2">
            <input
              type="date"
              value={customStart ?? ""}
              onChange={(e) => onPeriodChange("custom", e.target.value || undefined, customEnd)}
              className="h-9 text-sm text-gray-700 outline-none"
            />
          </div>
          <span className="text-gray-500 text-sm">→</span>
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2">
            <input
              type="date"
              value={customEnd ?? ""}
              onChange={(e) => onPeriodChange("custom", customStart, e.target.value || undefined)}
              className="h-9 text-sm text-gray-700 outline-none"
            />
          </div>
        </div>
      )}
      {period === "custom" && customStart && customEnd && (
        <span className="text-sm text-gray-500">{periodLabel}</span>
      )}
    </div>
  );
};

export default PeriodFilterBar;
