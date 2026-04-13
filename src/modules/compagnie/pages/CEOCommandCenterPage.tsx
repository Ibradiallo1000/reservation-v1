/**
 * Poste de pilotage â€” pÃ©riode globale + tableau de bord synthÃ¨se (trÃ©sorerie ledger, activitÃ©, alertes, tendance).
 */
import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { StandardLayoutWrapper } from "@/ui";
import { type PeriodKind } from "@/shared/date/periodUtils";
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

  return (
    <StandardLayoutWrapper noVerticalPadding className="!py-3 sm:!py-4">
      <header className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
            Pilotage CEO
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Vue décisionnelle : risque, trésorerie et priorités réseau.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label htmlFor="ceo-period" className="sr-only">
            PÃ©riode
          </label>
          <select
            id="ceo-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKind)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            <option value="day">Aujourd&apos;hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="custom">PersonnalisÃ©</option>
          </select>
          {period === "custom" && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
              <span className="text-sm text-gray-500 dark:text-slate-400">au</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
            </>
          )}
        </div>
      </header>

      {companyId ? (
        <CeoPilotageDashboard
          companyId={companyId}
          periodStartStr={globalPeriod.startDate}
          periodEndStr={globalPeriod.endDate}
          periodKind={period}
        />
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">Compagnie introuvable.</p>
      )}
    </StandardLayoutWrapper>
  );
}
