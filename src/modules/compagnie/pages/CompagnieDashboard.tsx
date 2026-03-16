// =============================================
// src/pages/CompagnieDashboard.tsx
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCompanyDashboardData } from "@/modules/compagnie/hooks/useCompanyDashboardData";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  Building2,
  Ticket,
} from "lucide-react";

import { Skeleton } from "@/shared/ui/skeleton";
import { StandardLayoutWrapper, PageHeader, MetricCard } from "@/ui";
import { TimeFilterBar, RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { ChannelSplitChart } from "@/modules/compagnie/admin/components/CompanyDashboard/ChannelSplitChart";

import { NetworkHealthSummary } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkHealthSummary";
import { CriticalAlertsPanel, type CriticalAlert } from "@/modules/compagnie/admin/components/CompanyDashboard/CriticalAlertsPanel";

import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageOfflineState } from "@/shared/ui/PageStates";
import {
  getNetworkStatsChartData,
  getNetworkStats,
} from "@/modules/compagnie/networkStats/networkStatsService";
import { getPreviousPeriod } from "@/shared/date/periodComparisonUtils";
import type { PeriodKind } from "@/shared/date/periodComparisonUtils";

/* ---------- helpers ---------- */
const DEFAULT_RANGE: RangeKey = "day";

function getDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

interface AgencyData {
  id?: string;
  nom?: string;
  revenus?: number;
  tauxRemplissage?: number;
}

export default function CompagnieDashboard() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();
  const isOnline = useOnlineStatus();

  // 🔥 CLÉ PRINCIPALE
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const money = useFormatCurrency();

  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = endOfToday;

    if (range === "day") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }

    const label = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(start);

    return { dateFrom: start, dateTo: end, periodLabel: label };
  }, [range, customStart, customEnd, now]);

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Performance Réseau" />
        <p className="text-sm text-muted-foreground">
          Identifiant de compagnie introuvable.
        </p>
      </StandardLayoutWrapper>
    );
  }

  const {
    loading,
    company,
    kpis,
    series,
    perAgency,
    alerts,
  } = useCompanyDashboardData({ companyId, dateFrom, dateTo });

  const [networkStats, setNetworkStats] = useState<Awaited<ReturnType<typeof getNetworkStats>> | null>(null);
  const [networkStatsLoading, setNetworkStatsLoading] = useState(false);
  const [prevStats, setPrevStats] = useState<Awaited<ReturnType<typeof getNetworkStats>> | null>(null);

  const dateFromStr = getDateKey(dateFrom);
  const dateToStr = getDateKey(dateTo);

  useEffect(() => {
    if (!companyId) return;
    setNetworkStatsLoading(true);
    getNetworkStats(companyId, dateFromStr, dateToStr)
      .then(setNetworkStats)
      .catch(() => setNetworkStats(null))
      .finally(() => setNetworkStatsLoading(false));
  }, [companyId, dateFromStr, dateToStr]);

  useEffect(() => {
    if (!companyId) return;
    const { previousStart, previousEnd } = getPreviousPeriod(dateFrom, dateTo, range as PeriodKind);
    getNetworkStats(companyId, previousStart, previousEnd)
      .then(setPrevStats)
      .catch(() => setPrevStats(null));
  }, [companyId, dateFrom, dateTo, range]);

  const statsLoading = loading || networkStatsLoading;
  const caFormatted = networkStats != null ? money(networkStats.totalRevenue) : kpis.caPeriodeFormatted;
  const ticketsCount = networkStats != null ? networkStats.totalTickets : kpis.reservationsCount;
  const activeAgences = networkStats != null ? networkStats.activeAgencies : kpis.agencesActives;
  const totalAgences = kpis.totalAgences ?? 0;
  const caDeltaPercent =
    networkStats != null && prevStats != null && prevStats.totalRevenue > 0
      ? Math.round(((networkStats.totalRevenue - prevStats.totalRevenue) / prevStats.totalRevenue) * 1000) / 10
      : kpis.caDeltaPercent;

  const [chartData, setChartData] = useState<Awaited<ReturnType<typeof getNetworkStatsChartData>> | null>(null);
  const [chartDataLoading, setChartDataLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    const startStr = getDateKey(dateFrom);
    const endStr = getDateKey(dateTo);
    setChartDataLoading(true);
    getNetworkStatsChartData(companyId, startStr, endStr)
      .then((data) => {
        setChartData(data);
        if (typeof console !== "undefined" && console.log) console.log("chartData", data);
      })
      .catch(() => setChartData(null))
      .finally(() => setChartDataLoading(false));
  }, [companyId, dateFrom, dateTo]);

  const agencies = (perAgency ?? []) as AgencyData[];
  const agencyDataWithVariation = agencies as (AgencyData & { variation?: number })[];

  // Santé du réseau : à risque si baisse de CA > 15 % vs période précédente OU aucun revenu sur la période
  const REVENUE_DROP_RISK_THRESHOLD = 15;
  const healthyAgencies = agencyDataWithVariation.filter(
    a => (a.revenus ?? 0) > 0 && (a.variation === undefined || a.variation >= -REVENUE_DROP_RISK_THRESHOLD)
  ).length;
  const atRiskAgencies = agencyDataWithVariation.filter(
    a => (a.revenus ?? 0) === 0 || (a.variation !== undefined && a.variation < -REVENUE_DROP_RISK_THRESHOLD)
  ).length;

  const trend = useMemo(() => {
    const pct = caDeltaPercent;
    if (pct == null) return "stable" as const;
    if (pct > 0) return "up" as const;
    if (pct < 0) return "down" as const;
    return "stable" as const;
  }, [caDeltaPercent]);

  const criticalAlerts: CriticalAlert[] =
    alerts?.map((alert: any, i: number) => ({
      id: alert.id ?? `alert-${i}`,
      title: alert.title ?? "Alerte",
      description: alert.description,
      level: alert.level ?? "medium",
    })) ?? [];

  const rankingByCa = useMemo(() => {
    const withCa = agencies.map((a) => ({ ...a, ca: a.revenus ?? 0 }));
    return [...withCa].sort((a, b) => b.ca - a.ca);
  }, [agencies]);

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Performance Réseau"
        subtitle={`Performance des agences : CA comparé, classement et alertes réseau — Période : ${periodLabel}`}
        right={
          <TimeFilterBar
            range={range}
            setRange={setRange}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />
        }
      />
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certains blocs de performance peuvent être retardés." />
      )}

      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link to={`/compagnie/${companyId}/reservations-reseau/reservations`} className="block">
            <MetricCard
              label="CA"
              value={caFormatted}
              icon={TrendingUp}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
          </Link>
          <Link to={`/compagnie/${companyId}/reservations-reseau/reservations`} className="block">
            <MetricCard
              label="Billets vendus"
              value={String(ticketsCount ?? 0)}
              icon={Ticket}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
          </Link>
          <Link to={`/compagnie/${companyId}/parametres`} className="block">
            <MetricCard
              label="Agences actives"
              value={`${activeAgences} / ${totalAgences}`}
              icon={Building2}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
          </Link>
        </div>
      )}

      {caDeltaPercent != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600 dark:text-slate-400">Variation vs période précédente :</span>
          <span
            className={`font-semibold ${caDeltaPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {caDeltaPercent >= 0 ? "+" : ""}{caDeltaPercent}%
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Évolution</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueReservationsChart
            data={
              chartData != null && chartData.length > 0
                ? chartData
                : chartData != null
                  ? (() => {
                      const dayKeyFrom = getDateKey(dateFrom);
                      const dayKeyTo = getDateKey(dateTo);
                      if (dayKeyFrom === dayKeyTo) {
                        return Array.from({ length: 24 }, (_, h) => ({
                          date: `${dayKeyFrom}T${String(h).padStart(2, "0")}`,
                          revenue: 0,
                          reservations: 0,
                        }));
                      }
                      const empty: { date: string; revenue: number; reservations: number }[] = [];
                      for (let t = dateFrom.getTime(); t <= dateTo.getTime(); t += 86400000) {
                        empty.push({ date: getDateKey(new Date(t)), revenue: 0, reservations: 0 });
                      }
                      return empty;
                    })()
                  : series.daily
            }
            loading={chartDataLoading || statsLoading}
            primaryColor={company?.couleurPrimaire}
            secondaryColor={company?.couleurSecondaire}
            range={range === "day" ? "day" : (chartData?.length ?? series.daily?.length ?? 0) <= 7 ? "week" : "month"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classement agences (CA période)</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Chargement…</p>
          ) : rankingByCa.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Aucune donnée pour la période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-600">
                    <th className="text-left py-2 text-gray-900 dark:text-white">Rang</th>
                    <th className="text-left py-2 text-gray-900 dark:text-white">Agence</th>
                    <th className="text-right py-2 text-gray-900 dark:text-white">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingByCa.map((a, i) => (
                    <tr key={a.id ?? i} className="border-b border-gray-100 dark:border-slate-700">
                      <td className="py-2 font-medium text-gray-900 dark:text-slate-200">{i + 1}</td>
                      <td className="py-2 text-gray-900 dark:text-slate-200">{a.nom || "Agence inconnue"}</td>
                      <td className="py-2 text-right text-gray-900 dark:text-slate-200">{money((a.revenus ?? 0) as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Santé du réseau</CardTitle>
        </CardHeader>
        <CardContent>
          <NetworkHealthSummary
            totalAgencies={totalAgences}
            healthyAgencies={healthyAgencies}
            atRiskAgencies={atRiskAgencies}
            trend={trend}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertes par agence</CardTitle>
        </CardHeader>
        <CardContent>
          <CriticalAlertsPanel alerts={criticalAlerts} loading={statsLoading} />
        </CardContent>
      </Card>

    </StandardLayoutWrapper>
  );
}
