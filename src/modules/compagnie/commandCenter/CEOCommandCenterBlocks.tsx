// CEO Cockpit V2 — Memoized blocks: État global (no chart), Risques, Performance réseau (top 3), Actions. No Recharts.
import { memo } from "react";
import { Link, useNavigate } from "react-router-dom";

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
      <section className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 md:p-5 shadow-sm overflow-hidden" aria-label="État global">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-3 sm:mb-4">1. État global</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4 mb-4">
          <div className="p-2 sm:p-3 rounded-lg bg-indigo-50 border border-indigo-100 min-w-0">
            <div className="text-xs sm:text-sm text-indigo-700">CA période actuelle</div>
            <div className="text-lg sm:text-xl font-bold text-indigo-800 truncate">{globalRevenue.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-emerald-50 border border-emerald-100 min-w-0">
            <div className="text-xs sm:text-sm text-emerald-700">Liquidités disponibles</div>
            <div className="text-lg sm:text-xl font-bold text-emerald-800 truncate">{financialPosition.netPosition.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-violet-50 border border-violet-100 min-w-0">
            <div className="text-xs sm:text-sm text-violet-700">Variation vs période préc.</div>
            <div className={`text-lg sm:text-xl font-bold truncate ${revenueVariationPercent >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {revenueVariationPercent >= 0 ? "+" : ""}{revenueVariationPercent.toFixed(1)}%
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-slate-50 border border-slate-200 min-w-0">
            <div className="text-xs sm:text-sm text-slate-700">Santé</div>
            <div className="text-lg sm:text-xl font-bold text-slate-800 truncate">
              {healthStatus === "critical" ? "Critique" : healthStatus === "attention" ? "Attention" : "Stable"}
            </div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg border flex items-center justify-center min-w-0">
            <span className="text-base sm:text-lg font-semibold truncate">
              {healthStatus === "critical" && <span className="text-red-600">🔴 Critique</span>}
              {healthStatus === "attention" && <span className="text-amber-600">🟡 Attention</span>}
              {healthStatus === "stable" && <span className="text-emerald-600">🟢 Stable</span>}
            </span>
          </div>
        </div>
      </section>

      {/* 2. RISQUES PRIORITAIRES */}
      <section className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 md:p-5 shadow-sm overflow-hidden" aria-label="Risques prioritaires">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-3 sm:mb-4">2. Risques prioritaires</h2>
        {prioritizedRisks.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun risque prioritaire.</p>
        ) : (
          <ul className="space-y-2">
            {prioritizedRisks.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-slate-50 border border-slate-100 min-w-0">
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.level === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                  {r.level === "critical" ? "Critique" : "Attention"}
                </span>
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
      </section>

      {/* 7. PERFORMANCE RÉSEAU (top 3 only) */}
      <section className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 md:p-5 shadow-sm overflow-hidden" aria-label="Performance réseau">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-3 sm:mb-4">7. Performance réseau</h2>
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
      </section>

      {/* 8. ACTIONS RAPIDES */}
      <section className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 md:p-5 shadow-sm overflow-hidden" aria-label="Actions rapides">
        <h2 className="text-base sm:text-lg font-semibold text-slate-800 mb-3 sm:mb-4">8. Actions rapides</h2>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/fleet`)}
            className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-800 font-medium text-sm hover:bg-indigo-200 transition"
          >
            Voir la flotte
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/operations-reseau`)}
            className="px-4 py-2 rounded-lg bg-amber-100 text-amber-800 font-medium text-sm hover:bg-amber-200 transition"
          >
            Voir sessions ouvertes
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/dashboard`)}
            className="px-4 py-2 rounded-lg bg-rose-100 text-rose-800 font-medium text-sm hover:bg-rose-200 transition"
          >
            Voir agences à risque
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg bg-slate-100 text-slate-800 font-medium text-sm hover:bg-slate-200 transition"
          >
            Export synthèse direction
          </button>
        </div>
      </section>
    </>
  );
});

export default CommandCenterBlocksAtoE;
