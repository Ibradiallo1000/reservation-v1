/**
 * Poste de pilotage — période globale + tableau de bord synthèse (trésorerie ledger, activité, alertes, tendance).
 */
import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { StandardLayoutWrapper } from "@/ui";
import { type PeriodKind } from "@/shared/date/periodUtils";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";
import CeoPilotageDashboard from "@/modules/compagnie/commandCenter/CeoPilotageDashboard";
import { normalizeRole } from "@/authorization/roles";
import { hasCapability } from "@/authorization/capabilities";
import AuthorizationStatePage from "@/modules/auth/components/AuthorizationStatePage";

export default function CEOCommandCenterPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const globalPeriod = useGlobalPeriodContext();
  const role = normalizeRole(Array.isArray(user?.role) ? user.role[0] : user?.role);

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
  const activePeriodLabel = React.useMemo(
    () =>
      formatActivityPeriodLabelFr(
        globalPeriod.startDate,
        globalPeriod.endDate,
        getTodayBamako()
      ),
    [globalPeriod.startDate, globalPeriod.endDate]
  );

  if (!role || !hasCapability(role, "company.command.view")) {
    return <AuthorizationStatePage state={role ? "access_denied" : "unknown_role"} />;
  }

  return (
    <StandardLayoutWrapper noVerticalPadding className="!py-4">
      <header className="flex w-full flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-gray-900 dark:text-white">
            Command Center
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {activePeriodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <label htmlFor="ceo-period" className="sr-only">
            Période
          </label>
          <select
            id="ceo-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodKind)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
          >
            <option value="day">Jour</option>
            <option value="week">Semaine</option>
            <option value="month">Mois</option>
            <option value="custom">Personnalisé</option>
          </select>
          {period === "custom" && (
            <>
              <input
                aria-label="Début de la période personnalisée"
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
              />
              <span className="text-sm text-gray-500 dark:text-slate-400">au</span>
              <input
                aria-label="Fin de la période personnalisée"
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
