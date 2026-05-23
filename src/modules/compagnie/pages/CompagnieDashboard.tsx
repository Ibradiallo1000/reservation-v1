// =============================================
// src/pages/CompagnieDashboard.tsx
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
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
import PlanBusinessMetricsPanel from "@/modules/compagnie/components/PlanBusinessMetricsPanel";
import {
  buildNetworkChartDataFromActivityLogDocs,
  type ChartDataPoint,
} from "@/modules/compagnie/networkStats/networkStatsService";
import { getPreviousPeriod } from "@/shared/date/periodComparisonUtils";
import type { PeriodKind } from "@/shared/date/periodComparisonUtils";
import { db } from "@/firebaseConfig";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import {
  aggregateActivityLogDocs,
  getUnifiedCommercialActivity,
  shouldUseDailyStatsForActivity,
} from "@/modules/compagnie/networkStats/activityCore";
import {
  aggregateNetworkActivityByAgencyFromDocs,
  type AgencyActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import { getStartOfDayInBamako, getEndOfDayInBamako, TZ_BAMAKO } from "@/shared/date/dateUtilsTz";
import { isInteractiveRangeTooLarge, largeRangeMessage } from "@/shared/date/periodUtils";

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

type CompanyMeta = {
  id: string;
  nom?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
};

type AgencyMeta = {
  id: string;
  nom: string;
  ville?: string;
};

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

  const [company, setCompany] = useState<CompanyMeta | null>(null);
  const [agencyMeta, setAgencyMeta] = useState<AgencyMeta[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activity, setActivity] = useState<Awaited<ReturnType<typeof aggregateActivityLogDocs>> | null>(null);
  const [prevActivity, setPrevActivity] = useState<Awaited<ReturnType<typeof aggregateActivityLogDocs>> | null>(null);
  const [agencyActivity, setAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [chartData, setChartData] = useState<ChartDataPoint[] | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const dateFromStr = getDateKey(dateFrom);
  const dateToStr = getDateKey(dateTo);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      getDoc(doc(db, "companies", companyId)),
      getDocs(collection(db, "companies", companyId, "agences")),
    ])
      .then(([companySnap, agenciesSnap]) => {
        if (companySnap.exists()) {
          setCompany({ id: companyId, ...(companySnap.data() as Omit<CompanyMeta, "id">) });
        }
        setAgencyMeta(
          agenciesSnap.docs.map((d) => {
            const x = d.data() as { nom?: string; nomAgence?: string; ville?: string };
            return { id: d.id, nom: x.nom ?? x.nomAgence ?? d.id, ville: x.ville };
          })
        );
      })
      .catch(() => {
        setCompany(null);
        setAgencyMeta([]);
      });
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    setActivityLoading(true);
    const start = getStartOfDayInBamako(dateFromStr);
    const end = getEndOfDayInBamako(dateToStr);
    if (isInteractiveRangeTooLarge(start, end)) {
      setRangeError(largeRangeMessage());
      setActivity(null);
      setPrevActivity(null);
      setChartData(null);
      setAgencyActivity([]);
      setActivityLoading(false);
      return;
    }
    setRangeError(null);
    const { previousStart, previousEnd } = getPreviousPeriod(dateFrom, dateTo, range as PeriodKind);
    const previousStartStr = typeof previousStart === "string" ? previousStart : getDateKey(previousStart);
    const previousEndStr = typeof previousEnd === "string" ? previousEnd : getDateKey(previousEnd);

    if (shouldUseDailyStatsForActivity(start, end)) {
      Promise.all([
        getUnifiedCommercialActivity(companyId, { dateFrom: dateFromStr, dateTo: dateToStr }, { timeZone: TZ_BAMAKO }),
        getUnifiedCommercialActivity(
          companyId,
          { dateFrom: previousStartStr, dateTo: previousEndStr },
          { timeZone: TZ_BAMAKO }
        ),
      ])
        .then(([current, previous]) => {
          setActivity(current);
          setPrevActivity(previous);
          setChartData(null);
          setAgencyActivity([]);
          setRangeError("Période agrégée : les KPI utilisent dailyStats, les détails agences sont désactivés.");
        })
        .catch(() => {
          setActivity(null);
          setPrevActivity(null);
          setChartData(null);
          setAgencyActivity([]);
        })
        .finally(() => setActivityLoading(false));
      return;
    }

    Promise.all([
      queryActivityLogsInRange(companyId, start, end),
      queryActivityLogsInRange(
        companyId,
        getStartOfDayInBamako(previousStart),
        getEndOfDayInBamako(previousEnd)
      ),
    ])
      .then(([docs, prevDocs]) => {
        setActivity(aggregateActivityLogDocs(docs));
        setPrevActivity(aggregateActivityLogDocs(prevDocs));
        setChartData(buildNetworkChartDataFromActivityLogDocs(docs, dateFromStr, dateToStr, TZ_BAMAKO));
        setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agencyMeta));
      })
      .catch(() => {
        setActivity(null);
        setPrevActivity(null);
        setChartData(null);
        setAgencyActivity([]);
      })
      .finally(() => setActivityLoading(false));
  }, [companyId, dateFromStr, dateToStr, dateFrom, dateTo, range, agencyMeta]);

  const statsLoading = activityLoading;
  const caFormatted = money(activity?.totalAmount ?? 0);
  const ticketsCount = activity?.billets.tickets ?? 0;
  const activeAgences = agencyActivity.filter((a) => a.ventes > 0 || a.colis > 0).length;
  const totalAgences = agencyMeta.length;
  const caDeltaPercent =
    activity != null && prevActivity != null && prevActivity.totalAmount > 0
      ? Math.round(((activity.totalAmount - prevActivity.totalAmount) / prevActivity.totalAmount) * 1000) / 10
      : null;

  const agencies = agencyActivity.map((agency) => ({
    id: agency.agencyId,
    nom: agencyMeta.find((a) => a.id === agency.agencyId)?.nom ?? agency.agencyId,
    ...agency,
    revenus: agency.ventes,
    tauxRemplissage: undefined,
  })) as AgencyData[];
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
    agencyDataWithVariation
      .filter((a) => (a.revenus ?? 0) === 0)
      .map((a) => ({
        id: `no-activity-${a.id}`,
        title: "Agence sans activité",
        description: a.nom ?? "Agence inconnue",
        level: "medium",
      }));

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

      {rangeError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {rangeError}
        </div>
      )}

      <PlanBusinessMetricsPanel
        companyId={companyId}
        primaryColor={company?.couleurPrimaire ?? "var(--teliya-primary)"}
      />

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
                  : []
            }
            loading={statsLoading}
            primaryColor={company?.couleurPrimaire}
            secondaryColor={company?.couleurSecondaire}
            range={range === "day" ? "day" : (chartData?.length ?? 0) <= 7 ? "week" : "month"}
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
