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
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex flex-wrap gap-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            onClick={() => {
              if (opt.kind === "custom") {
                const end = new Date();
                const start = new Date(end);
                start.setDate(start.getDate() - 30);
                onPeriodChange("custom", start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
              } else {
                onPeriodChange(opt.kind);
              }
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              period === opt.kind
                ? "bg-indigo-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={customStart ?? ""}
            onChange={(e) => onPeriodChange("custom", e.target.value || undefined, customEnd)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
          <span className="text-gray-500 text-sm">→</span>
          <input
            type="date"
            value={customEnd ?? ""}
            onChange={(e) => onPeriodChange("custom", customStart, e.target.value || undefined)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
          />
        </div>
      )}
      <span className="text-sm text-gray-500">{periodLabel}</span>
    </div>
  );
};

export default PeriodFilterBar;
