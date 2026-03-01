// CEO Cockpit V2 — Memoized blocks: État global (no chart), Risques, Performance réseau (top 3), Actions. No Recharts.
import { memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SectionCard, StatusBadge } from "@/ui";

export type BlocksAtoEData = {
  globalRevenue: number;
  pendingRevenue: number;
  financialPosition: { netPosition: number };
  revenueVariationPercent: number;
  healthStatus: "stable" | "attention" | "critical";
  prioritizedRisks: { id: string; label: string; level: "critical" | "warning"; actionRoute: string }[];
  top3Agencies: { agencyId: string; nom: string; revenue: number }[];
};

const CommandCenterBlocksAtoE = memo(function CommandCenterBlocksAtoE({
  companyId,
  navigate,
  data,
}: {
  companyId: string;
  navigate: ReturnType<typeof useNavigate>;
  data: BlocksAtoEData;
}) {
  const {
    globalRevenue,
    pendingRevenue,
    financialPosition,
    revenueVariationPercent,
    healthStatus,
    prioritizedRisks,
    top3Agencies,
  } = data;
  return (
    <>
      {/* 1. ÉTAT GLOBAL (no chart) */}
      <SectionCard title="1. État global">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-4">
          <div className="p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">CA période actuelle</div>
            <div className="text-lg sm:text-xl font-bold text-gray-900 truncate">{globalRevenue.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Liquidités disponibles</div>
            <div className="text-lg sm:text-xl font-bold text-gray-900 truncate">{financialPosition.netPosition.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Variation vs période préc.</div>
            <div className={`text-lg sm:text-xl font-bold truncate ${revenueVariationPercent >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {revenueVariationPercent >= 0 ? "+" : ""}{revenueVariationPercent.toFixed(1)}%
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Santé</div>
            <div className="text-lg sm:text-xl font-bold text-slate-800 truncate">
              {healthStatus === "critical" ? "Critique" : healthStatus === "attention" ? "Attention" : "Stable"}
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg border border-gray-200 flex items-center justify-center min-w-0">
            <StatusBadge status={healthStatus === "critical" ? "danger" : healthStatus === "attention" ? "warning" : "success"}>
              {healthStatus === "critical" ? "Critique" : healthStatus === "attention" ? "Attention" : "Stable"}
            </StatusBadge>
          </div>
        </div>
      </SectionCard>

      {/* 2. RISQUES PRIORITAIRES */}
      <SectionCard title="2. Risques prioritaires">
        {prioritizedRisks.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun risque prioritaire.</p>
        ) : (
          <ul className="space-y-2">
            {prioritizedRisks.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
                <StatusBadge status={r.level === "critical" ? "danger" : "warning"}>
                  {r.level === "critical" ? "Critique" : "Attention"}
                </StatusBadge>
                <span className="text-sm text-slate-700">{r.label}</span>
                <Link
                  to={`/compagnie/${companyId}/${r.actionRoute}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Corriger →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 7. PERFORMANCE RÉSEAU (top 3 only) */}
      <SectionCard title="7. Performance réseau">
        <div>
          <h3 className="text-sm font-medium text-slate-600 mb-2">Top 3 agences (CA)</h3>
          <ul className="space-y-1 text-sm">
            {top3Agencies.map((a) => (
              <li key={a.agencyId} className="flex justify-between">
                <span>{a.nom}</span>
                <span className="font-medium">{a.revenue.toLocaleString("fr-FR")}</span>
              </li>
            ))}
            {top3Agencies.length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </div>
      </SectionCard>

      {/* 8. ACTIONS RAPIDES */}
      <SectionCard title="8. Actions rapides">
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/fleet`)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Voir la flotte
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/operations-reseau`)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Voir sessions ouvertes
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/dashboard`)}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Voir agences à risque
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Export synthèse direction
          </button>
        </div>
      </SectionCard>
    </>
  );
});

export default CommandCenterBlocksAtoE;
