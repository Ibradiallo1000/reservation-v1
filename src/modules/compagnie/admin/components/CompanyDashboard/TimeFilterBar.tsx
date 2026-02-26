import React from "react";
import { Calendar, Filter } from "lucide-react";

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
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Filtres rapides */}
      {([
        { key: "day", label: "Jour" },
        { key: "month", label: "Mois en cours" },
        { key: "prev_month", label: "Mois précédent" },
        { key: "ytd", label: "Depuis janvier" },
        { key: "12m", label: "12 derniers mois" },
        { key: "custom", label: "Personnalisé" },
      ] as { key: RangeKey; label: string }[]).map((opt) => (
        <button
          key={opt.key}
          onClick={() => setRange(opt.key)}
          className={`px-3 py-1 text-sm rounded-full border transition ${
            range === opt.key
              ? "bg-[var(--btn-primary,#FF6600)] text-white border-[var(--btn-primary,#FF6600)]"
              : "bg-white text-gray-700 hover:bg-gray-100 border-gray-300"
          }`}
        >
          {opt.label}
        </button>
      ))}

      {/* Filtres de date personnalisée */}
      {range === "custom" && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={customStart || ""}
              onChange={(e) => setCustomStart(e.target.value || null)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <span className="text-gray-500">→</span>
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4 text-gray-500" />
            <input
              type="date"
              value={customEnd || ""}
              onChange={(e) => setCustomEnd(e.target.value || null)}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
};
