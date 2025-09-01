// =============================================
// src/components/CompanyDashboard/TimeFilterBar.tsx
// =============================================
import React from "react";
import { ChevronDown } from "lucide-react";

export type RangeKey = "month" | "prev_month" | "ytd" | "12m" | "custom";

export function TimeFilterBar({
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}: {
  range: RangeKey;
  setRange: React.Dispatch<React.SetStateAction<RangeKey>>;
  customStart: string | null;
  setCustomStart: (v: string | null) => void;
  customEnd: string | null;
  setCustomEnd: (v: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="h-9 rounded-lg border bg-white px-3 pr-8 text-sm outline-none shadow-sm"
        value={range}
        onChange={(e) => setRange(e.target.value as RangeKey)}
      >
        <option value="month">Mois en cours</option>
        <option value="prev_month">Mois précédent</option>
        <option value="ytd">Depuis le 1er janvier</option>
        <option value="12m">12 derniers mois</option>
        <option value="custom">Plage personnalisée…</option>
      </select>

      {range === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="h-9 rounded-lg border bg-white px-3 text-sm shadow-sm"
            value={customStart ?? ""}
            onChange={(e) => setCustomStart(e.target.value || null)}
          />
          <span className="text-sm text-muted-foreground">→</span>
          <input
            type="date"
            className="h-9 rounded-lg border bg-white px-3 text-sm shadow-sm"
            value={customEnd ?? ""}
            onChange={(e) => setCustomEnd(e.target.value || null)}
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronDown className="h-4 w-4" />
        <span>Changer la période</span>
      </div>
    </div>
  );
}
