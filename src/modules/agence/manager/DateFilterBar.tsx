/**
 * Date filter bar for Manager pages. Uses @/ui only (no MGR).
 */
import React from "react";
import { ActionButton } from "@/ui";
import type { DatePreset } from "./dateFilterUtils";
import { PRESET_LABELS } from "./dateFilterUtils";

const inputClass =
  "border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-gray-600 dark:bg-gray-800";

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
    {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
      <ActionButton
        key={p}
        variant={preset === p ? "primary" : "secondary"}
        size="sm"
        onClick={() => onPresetChange(p)}
      >
        {PRESET_LABELS[p]}
      </ActionButton>
    ))}
    {preset === "custom" && (
      <div className="flex items-center gap-2 ml-1">
        <input
          type="date"
          value={customStart}
          onChange={(e) => onCustomStartChange(e.target.value)}
          className={inputClass}
        />
        <span className="text-gray-400">&rarr;</span>
        <input
          type="date"
          value={customEnd}
          onChange={(e) => onCustomEndChange(e.target.value)}
          className={inputClass}
        />
      </div>
    )}
  </div>
);
