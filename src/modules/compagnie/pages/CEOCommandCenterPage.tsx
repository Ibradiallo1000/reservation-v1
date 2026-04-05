/**
 * Poste de pilotage — période globale + tableau de bord synthèse (trésorerie ledger, activité, alertes, tendance).
 */
import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { Gauge } from "lucide-react";
import { getPeriodLabel, type PeriodKind } from "@/shared/date/periodUtils";
import CeoPilotageDashboard from "@/modules/compagnie/commandCenter/CeoPilotageDashboard";

export default function CEOCommandCenterPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const globalPeriod = useGlobalPeriodContext();

  const period = globalPeriod.preset as PeriodKind;
  const customStart = globalPeriod.preset === "custom" ? globalPeriod.startDate : "";
  const customEnd = globalPeriod.preset === "custom" ? globalPeriod.endDate : "";
  const setPeriod = React.useCallback((p: PeriodKind) => globalPeriod.setPreset(p), [globalPeriod]);
  const setCustomStart = React.useCallback(
    (v: string) => globalPeriod.setCustomRange(v, globalPeriod.endDate),
    [globalPeriod]
  );
  const setCustomEnd = React.useCallback(
    (v: string) => globalPeriod.setCustomRange(globalPeriod.startDate, v),
    [globalPeriod]
  );

  const periodLabelShort =
    period === "day"
      ? "Jour"
      : period === "week"
        ? "Semaine"
        : period === "month"
          ? "Mois"
          : "Période";

  return (
    <StandardLayoutWrapper noVerticalPadding className="px-4 md:px-6 pt-2 md:pt-3 pb-4 md:pb-5 space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle={`${periodLabelShort} — ${getPeriodLabel(period, { start: new Date(globalPeriod.startDate), end: new Date(globalPeriod.endDate) }, customStart || undefined, customEnd || undefined)}`}
        icon={Gauge}
        className="mb-2"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKind)}
              className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              <option value="day">Aujourd&apos;hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="custom">Personnalisé</option>
            </select>
            {period === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
                />
                <span className="text-gray-500">→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
                />
              </>
            )}
          </div>
        }
      />

      {companyId ? (
        <CeoPilotageDashboard
          companyId={companyId}
          periodStartStr={globalPeriod.startDate}
          periodEndStr={globalPeriod.endDate}
          periodKind={period}
        />
      ) : (
        <p className="text-sm text-slate-500">Compagnie introuvable.</p>
      )}
    </StandardLayoutWrapper>
  );
}
