import React from "react";
import { Calendar } from "lucide-react";

export type RangeKey = "day" | "month" | "prev_month" | "ytd" | "12m" | "custom";

interface Props {
  range: RangeKey;
  setRange: (v: RangeKey) => void;
  customStart: string | null;
  setCustomStart: (v: string | null) => void;
  customEnd: string | null;
  setCustomEnd: (v: string | null) => void;
}

export const TimeFilterBar: React.FC<Props> = ({
  range,
  setRange,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
}) => {
  const options: { key: RangeKey; label: string }[] = [
    { key: "day", label: "Jour" },
    { key: "month", label: "Mois en cours" },
    { key: "prev_month", label: "Mois précédent" },
    { key: "ytd", label: "Depuis janvier" },
    { key: "12m", label: "12 derniers mois" },
    { key: "custom", label: "Personnalisé" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={range}
        onChange={(e) => setRange(e.target.value as RangeKey)}
        className="h-9 min-w-[190px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
      >
        {options.map((opt) => (
          <option key={opt.key} value={opt.key}>
            {opt.label}
          </option>
        ))}
      </select>

      {range === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={customStart || ""}
              onChange={(e) => setCustomStart(e.target.value || null)}
              className="h-9 text-sm text-gray-700 outline-none"
            />
          </div>
          <span className="text-gray-500">→</span>
          <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={customEnd || ""}
              onChange={(e) => setCustomEnd(e.target.value || null)}
              className="h-9 text-sm text-gray-700 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
