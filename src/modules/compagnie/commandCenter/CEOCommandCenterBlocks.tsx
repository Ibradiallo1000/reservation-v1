// CEO Cockpit V2 — Memoized blocks: État global (no chart), Risques, Performance réseau (top 3), Actions. No Recharts.
import { memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SectionCard, StatusBadge } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  getCeoRiskLevelLabelFr,
  getCeoStatusLabelFr,
  type CeoGlobalStatus,
  type CeoRiskLevel,
} from "@/modules/compagnie/commandCenter/ceoRiskRules";

export type BlocksAtoEData = {
  globalTicketRevenue: number;
  globalCourierRevenue: number;
  globalTotalRevenue: number;
  pendingRevenue: number;
  /** Solde mobile money (ledger) — obligatoire, pas d’agrégat de secours. */
  ledgerMobileMoneyAmount: number;
  /** Solde banque / agrégat compagnie (ledger ou comptes entreprise). */
  ledgerBankOrCompanyAmount: number;
  financialPosition: { netPosition: number };
  pendingPayablesAmount: number;
  pendingPayablesCount: number;
  estimatedMonthlyBurn: number;
  estimatedRunwayMonths: number | null;
  realizedRevenue: number;
  realizedCosts: number;
  realizedProfit: number;
  targetMarginPercent: number;
  budgetGapTop3: { agencyId: string; nom: string; gap: number }[];
  activeSessionsCount: number;
  pendingValidationSessionsCount: number;
  activeCourierSessionsCount: number;
  pendingCourierValidationCount: number;
  vehiclesInTransitCount: number;
  boardingOpenCount: number;
  criticalCashDiscrepanciesCount: number;
  fleetUnavailableCount: number;
  revenueVariationPercent: number;
  healthStatus: CeoGlobalStatus;
  prioritizedRisks: {
    id: string;
    label: string;
    level: CeoRiskLevel;
    actionRoute: string;
    impactText?: string;
    actionText?: string;
  }[];
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
    globalTicketRevenue,
    globalCourierRevenue,
    globalTotalRevenue,
    pendingRevenue,
    ledgerMobileMoneyAmount,
    ledgerBankOrCompanyAmount,
    financialPosition,
    pendingPayablesAmount,
    pendingPayablesCount,
    estimatedMonthlyBurn,
    estimatedRunwayMonths,
    realizedRevenue,
    realizedCosts,
    realizedProfit,
    targetMarginPercent,
    budgetGapTop3,
    activeSessionsCount,
    pendingValidationSessionsCount,
    activeCourierSessionsCount,
    pendingCourierValidationCount,
    vehiclesInTransitCount,
    boardingOpenCount,
    criticalCashDiscrepanciesCount,
    fleetUnavailableCount,
    revenueVariationPercent,
    healthStatus,
    prioritizedRisks,
    top3Agencies,
  } = data;
  const money = useFormatCurrency();
  return (
    <>
      {/* 1. ÉTAT GLOBAL (no chart) */}
      <SectionCard title="1. État global">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 mb-2">
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">CA total (période)</div>
            <div className="text-base sm:text-lg font-bold text-gray-900 truncate">{money(globalTotalRevenue)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Billets</div>
            <div className="text-base sm:text-lg font-bold text-gray-800 truncate">{money(globalTicketRevenue)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Courrier</div>
            <div className="text-base sm:text-lg font-bold text-gray-800 truncate">{money(globalCourierRevenue)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Liquidités</div>
            <div className="text-base sm:text-lg font-bold text-gray-900 truncate">{money(financialPosition.netPosition)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Variation vs période préc.</div>
            <div className={`text-base sm:text-lg font-bold truncate ${revenueVariationPercent >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {revenueVariationPercent >= 0 ? "+" : ""}{revenueVariationPercent.toFixed(1)}%
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
            <div className="text-xs sm:text-sm text-gray-700">Santé</div>
            <div className="text-base sm:text-lg font-bold text-slate-800 truncate">
              {getCeoStatusLabelFr(healthStatus)}
            </div>
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
              <li key={r.id} className="flex flex-wrap items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200 min-w-0">
                <StatusBadge status={r.level === "danger" ? "danger" : "warning"}>
                  {getCeoRiskLevelLabelFr(r.level)}
                </StatusBadge>
                <span className="text-sm text-slate-700">{r.label}</span>
                {r.impactText ? (
                  <span className="text-xs text-slate-500">Impact: {r.impactText}</span>
                ) : null}
                <Link
                  to={`/compagnie/${companyId}/${r.actionRoute}`}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {r.actionText ?? "Corriger"} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 3. CASH & RUNWAY */}
      <SectionCard title="3. Cash & Runway">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Cash net disponible</div>
            <div className="text-base font-bold text-gray-900">{money(financialPosition.netPosition)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">En attente validation (guichet)</div>
            <div className="text-base font-bold text-indigo-700">{money(pendingRevenue)}</div>
            <div className="text-[11px] text-slate-500">
              Argent encaissé au poste, non validé comptablement.
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Mobile money (ledger)</div>
            <div className="text-base font-bold text-emerald-700">{money(ledgerMobileMoneyAmount)}</div>
            <div className="text-[11px] text-slate-500">Solde comptes type=mobile_money (accounts).</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Banque (ledger)</div>
            <div className="text-base font-bold text-slate-900">{money(ledgerBankOrCompanyAmount)}</div>
            <div className="text-[11px] text-slate-500">Comptes type=bank (niveau compagnie).</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Engagements fournisseurs</div>
            <div className="text-base font-bold text-rose-700">{money(pendingPayablesAmount)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Runway estimé</div>
            <div className="text-base font-bold text-gray-900">
              {estimatedRunwayMonths == null ? "N/A" : `${estimatedRunwayMonths.toFixed(1)} mois`}
            </div>
            <div className="text-[11px] text-slate-500">
              Burn estimé: {estimatedMonthlyBurn > 0 ? money(estimatedMonthlyBurn) : "N/A"} / mois
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 4. BUDGET VS RÉALISÉ */}
      <SectionCard title="4. Budget vs Réalisé">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Revenus réalisés</div>
            <div className="text-base font-bold text-gray-900">{money(realizedRevenue)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Coûts réalisés</div>
            <div className="text-base font-bold text-gray-900">{money(realizedCosts)}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Marge réalisée</div>
            <div className={`text-base font-bold ${realizedProfit >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {money(realizedProfit)}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Objectif marge min</div>
            <div className="text-base font-bold text-gray-900">{targetMarginPercent.toFixed(1)}%</div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-600 mb-2">Top écarts négatifs (vs objectif)</h3>
          <ul className="space-y-1 text-sm">
            {budgetGapTop3.map((a) => (
              <li key={a.agencyId} className="flex justify-between">
                <span>{a.nom}</span>
                <span className={`font-medium ${a.gap < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(a.gap)}</span>
              </li>
            ))}
            {budgetGapTop3.length === 0 && <li className="text-slate-500">Aucun écart négatif majeur.</li>}
          </ul>
        </div>
      </SectionCard>

      {/* 5. OPÉRATIONS CRITIQUES */}
      <SectionCard title="5. Opérations critiques">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Sessions actives</div>
            <div className="text-base font-bold text-gray-900">{activeSessionsCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Sessions à valider</div>
            <div className="text-base font-bold text-amber-700">{pendingValidationSessionsCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Sessions courrier actives</div>
            <div className="text-base font-bold text-gray-900">{activeCourierSessionsCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Courrier en attente validation</div>
            <div className="text-base font-bold text-amber-700">{pendingCourierValidationCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Véhicules en transit</div>
            <div className="text-base font-bold text-gray-900">{vehiclesInTransitCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Embarquements ouverts</div>
            <div className="text-base font-bold text-gray-900">{boardingOpenCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Écarts caisse critiques</div>
            <div className={`text-base font-bold ${criticalCashDiscrepanciesCount > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {criticalCashDiscrepanciesCount}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Flotte indisponible</div>
            <div className={`text-base font-bold ${fleetUnavailableCount > 0 ? "text-rose-700" : "text-emerald-700"}`}>
              {fleetUnavailableCount}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 6. PERFORMANCE RÉSEAU (top 3 only) */}
      <SectionCard title="6. Performance réseau">
        <div>
          <h3 className="text-sm font-medium text-slate-600 mb-2">Top 3 agences (CA)</h3>
          <ul className="space-y-1 text-sm">
            {top3Agencies.map((a) => (
              <li key={a.agencyId} className="flex justify-between">
                <span>{a.nom}</span>
                <span className="font-medium">{money(a.revenue)}</span>
              </li>
            ))}
            {top3Agencies.length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </div>
      </SectionCard>

      {/* 7. VALIDATION DG */}
      <SectionCard title="7. Validation DG">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Payables à arbitrer</div>
            <div className="text-base font-bold text-gray-900">
              {pendingPayablesCount} dossier(s) - {money(pendingPayablesAmount)}
            </div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Sessions en attente de validation</div>
            <div className="text-base font-bold text-amber-700">{pendingValidationSessionsCount}</div>
          </div>
          <div className="p-2 rounded-lg bg-gray-50 border border-gray-200">
            <div className="text-xs text-gray-700">Risques critiques actifs</div>
            <div className="text-base font-bold text-rose-700">
              {prioritizedRisks.filter((r) => r.level === "danger").length}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/payment-approvals`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Traiter validations paiements
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/ceo-expenses`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Valider dépenses stratégiques
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/revenus-liquidites`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Vérifier trésorerie
          </button>
        </div>
      </SectionCard>

      {/* 8. PLAN D'ACTION */}
      <SectionCard title="8. Plan d'action">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/fleet`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Voir la flotte
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/operations-reseau`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Voir sessions ouvertes
          </button>
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/dashboard`)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Voir agences à risque
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white font-medium text-sm hover:bg-gray-50 transition"
          >
            Export synthèse direction
          </button>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-slate-700">
          <li>Priorité 1 : traiter les risques {prioritizedRisks.filter((r) => r.level === "danger").length > 0 ? "Danger" : "Attention"}.</li>
          <li>Priorité 2 : valider {pendingValidationSessionsCount} session(s) en attente.</li>
          <li>Priorité 3 : sécuriser la trésorerie et suivre les engagements fournisseurs.</li>
        </ul>
      </SectionCard>
    </>
  );
});

export default CommandCenterBlocksAtoE;
