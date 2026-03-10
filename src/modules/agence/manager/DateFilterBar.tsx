/**
 * Date filter bar for Manager pages. Uses @/ui only (no MGR).
 */
import React from "react";
import type { DatePreset } from "./dateFilterUtils";
import { PRESET_LABELS } from "./dateFilterUtils";

const inputClass = "h-9 text-sm text-gray-700 outline-none";

export const DateFilterBar: React.FC<{
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}> = ({
  preset,
  onPresetChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <select
      value={preset}
      onChange={(e) => onPresetChange(e.target.value as DatePreset)}
      className="h-9 min-w-[170px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
    >
      {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
        <option key={p} value={p}>
          {PRESET_LABELS[p]}
        </option>
      ))}
    </select>
    {preset === "custom" && (
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-gray-300 bg-white px-2 dark:border-gray-600 dark:bg-gray-800">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <span className="text-gray-400">&rarr;</span>
        <div className="flex items-center rounded-lg border border-gray-300 bg-white px-2 dark:border-gray-600 dark:bg-gray-800">
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    )}
  </div>
);
