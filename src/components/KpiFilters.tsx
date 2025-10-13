// src/components/KpiFilters.tsx
import React from "react";

export type PeriodPreset = "today" | "thisMonth" | "custom";

export type Filters = {
  period: PeriodPreset;
  start?: string; // 'YYYY-MM-DD' quand custom
  end?: string;   // 'YYYY-MM-DD' quand custom
  companyId?: string; // optionnel, utile côté Admin
};

type Props = {
  value: Filters;
  onChange: (f: Filters) => void;
  companies?: { id: string; name: string }[]; // optionnel
  showCompany?: boolean;                       // optionnel
};

const KpiFilters: React.FC<Props> = ({ value, onChange, companies = [], showCompany = false }) => {
  const setPeriod = (p: PeriodPreset) => onChange({ ...value, period: p });

  return (
    <div className="flex flex-col md:flex-row md:items-end gap-3 bg-white p-4 rounded-xl border shadow-sm">
      {/* Période */}
      <div className="flex-1">
        <label className="block text-sm text-gray-600 mb-1">Période</label>
        <div className="flex gap-2">
          <button
            onClick={() => setPeriod("today")}
            className={`px-3 py-1 rounded-full text-sm ${
              value.period === "today" ? "bg-orange-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            Aujourd’hui
          </button>
          <button
            onClick={() => setPeriod("thisMonth")}
            className={`px-3 py-1 rounded-full text-sm ${
              value.period === "thisMonth" ? "bg-orange-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            Mois en cours
          </button>
          <button
            onClick={() => setPeriod("custom")}
            className={`px-3 py-1 rounded-full text-sm ${
              value.period === "custom" ? "bg-orange-600 text-white" : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            Personnalisée
          </button>
        </div>
      </div>

      {/* Dates custom */}
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-sm text-gray-600 mb-1">Du</label>
          <input
            type="date"
            className="border rounded-lg px-2 py-1"
            disabled={value.period !== "custom"}
            value={value.start ?? ""}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-sm text-gray-600 mb-1">Au</label>
          <input
            type="date"
            className="border rounded-lg px-2 py-1"
            disabled={value.period !== "custom"}
            value={value.end ?? ""}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </div>
      </div>

      {/* Compagnie (optionnel) */}
      {showCompany && (
        <div className="min-w-[220px]">
          <label className="block text-sm text-gray-600 mb-1">Compagnie</label>
          <select
            className="w-full border rounded-lg px-2 py-1 bg-white"
            value={value.companyId ?? "__all__"}
            onChange={(e) => onChange({ ...value, companyId: e.target.value === "__all__" ? undefined : e.target.value })}
          >
            <option value="__all__">Toutes</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

export default KpiFilters;
