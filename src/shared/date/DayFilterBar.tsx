/**
 * Barre de filtre par jour : Aujourd'hui | Hier | Personnalisé.
 * Même style que DateFilterBar / PeriodFilterBar pour uniformiser les vues (escale, rapports).
 */
import React from "react";
import type { DayPreset } from "./dayFilterUtils";
import { DAY_PRESET_LABELS } from "./dayFilterUtils";

const inputClass =
  "h-9 text-sm text-gray-700 outline-none dark:text-gray-200 dark:bg-gray-800 dark:border-gray-600 rounded-lg border border-gray-300 px-2";

export interface DayFilterBarProps {
  preset: DayPreset;
  customDate: string;
  onPresetChange: (p: DayPreset) => void;
  onCustomDateChange: (v: string) => void;
  className?: string;
}

export const DayFilterBar: React.FC<DayFilterBarProps> = ({
  preset,
  customDate,
  onPresetChange,
  onCustomDateChange,
  className = "",
}) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>
    <select
      value={preset}
      onChange={(e) => onPresetChange(e.target.value as DayPreset)}
      className="h-9 min-w-[160px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
    >
      {(Object.keys(DAY_PRESET_LABELS) as DayPreset[]).map((p) => (
        <option key={p} value={p}>
          {DAY_PRESET_LABELS[p]}
        </option>
      ))}
    </select>
    {preset === "custom" && (
      <div className="flex items-center rounded-lg border border-gray-300 bg-white px-2 dark:border-gray-600 dark:bg-gray-800">
        <input
          type="date"
          value={customDate}
          onChange={(e) => onCustomDateChange(e.target.value)}
          className={inputClass}
        />
      </div>
    )}
  </div>
);

export default DayFilterBar;
