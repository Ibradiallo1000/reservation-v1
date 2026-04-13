/**
 * Activite reseau - source unique: activityLogs (billets + colis).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Minus,
  Package,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard } from "@/ui";
import { pageMaxWidthFluid } from "@/ui/foundation";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageOfflineState } from "@/shared/ui/PageStates";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import {
  aggregateActivityLogDocs,
  type UnifiedCommercialActivity,
} from "@/modules/compagnie/networkStats/activityCore";
import {
  buildNetworkChartDataFromActivityLogDocs,
  type ChartDataPoint,
} from "@/modules/compagnie/networkStats/networkStatsService";
import {
  aggregateNetworkActivityByAgencyFromDocs,
  aggregateRouteActivityRowsFromDocs,
  type AgencyActivityRow,
  type RouteActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import { getStartOfDayInBamako, getEndOfDayInBamako, getTodayBamako, TZ_BAMAKO } from "@/shared/date/dateUtilsTz";
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import InfoTooltip from "@/shared/ui/InfoTooltip";

dayjs.extend(utc);
dayjs.extend(timezone);

type SignalTone = "positive" | "neutral" | "negative";
type AgencyBadgeTone = "top" | "positive" | "neutral" | "negative" | "critical";

function computeDeltaPercent(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  return Math.round(delta * 10) / 10;
}

function formatDeltaPercent(delta: number | null): string | null {
  if (delta == null || Number.isNaN(delta)) return null;
  if (delta === 0) return "0%";
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

function signalToneFromDelta(current: number, previous: number, options?: { zeroIsWarning?: boolean }): SignalTone {
  const zeroIsWarning = options?.zeroIsWarning ?? false;
  if (zeroIsWarning && current <= 0) return "negative";
  const delta = computeDeltaPercent(current, previous);
  if (delta == null) return "neutral";
  if (delta >= 5) return "positive";
  if (delta <= -5) return "negative";
  return "neutral";
}

function kpiSignalLabel(tone: SignalTone): string {
  if (tone === "positive") return "Signal positif";
  if (tone === "negative") return "Signal a risque";
  return "Signal neutre";
}

function signalBadgeClass(tone: AgencyBadgeTone): string {
  if (tone === "top") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200";
  }
  if (tone === "positive") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200";
  }
  if (tone === "critical") {
    return "border-red-300 bg-red-100 text-red-800 dark:border-red-700 dark:bg-red-900/45 dark:text-red-200";
  }
  if (tone === "negative") {
    return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200";
  }
  return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
}

function deltaToneClass(delta: number | null): string {
  if (delta == null) return "text-slate-600 dark:text-slate-300";
  if (delta > 0) return "text-emerald-700 dark:text-emerald-300";
  if (delta < 0) return "text-red-700 dark:text-red-300";
  return "text-slate-600 dark:text-slate-300";
}

export default function ReservationsReseauPage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();
  const isOnline = useOnlineStatus();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();

  const startStr = globalPeriod.startDate;
  const endStr = globalPeriod.endDate;

  const {
    periodLabel,
    previousPeriodLabel,
    periodStart,
    periodEnd,
    previousPeriodStart,
    previousPeriodEnd,
  } = useMemo(() => {
    const currentLabel = formatActivityPeriodLabelFr(startStr, endStr, getTodayBamako());
    const startDj = dayjs.tz(`${startStr}T12:00:00`, TZ_BAMAKO);
    const endDj = dayjs.tz(`${endStr}T12:00:00`, TZ_BAMAKO);
    const periodLen = Math.max(1, endDj.diff(startDj, "day") + 1);
    const prevEndDj = startDj.subtract(1, "day");
    const prevStartDj = prevEndDj.subtract(periodLen - 1, "day");
    const prevStart = prevStartDj.format("YYYY-MM-DD");
    const prevEnd = prevEndDj.format("YYYY-MM-DD");
    const previousLabel = formatActivityPeriodLabelFr(prevStart, prevEnd, getTodayBamako());
    return {
      periodLabel: currentLabel,
      previousPeriodLabel: previousLabel,
      periodStart: getStartOfDayInBamako(startStr),
      periodEnd: getEndOfDayInBamako(endStr),
      previousPeriodStart: getStartOfDayInBamako(prevStart),
      previousPeriodEnd: getEndOfDayInBamako(prevEnd),
    };
  }, [startStr, endStr]);

  const [logActivity, setLogActivity] = useState<UnifiedCommercialActivity | null>(null);
  const [previousLogActivity, setPreviousLogActivity] = useState<UnifiedCommercialActivity | null>(null);
  const [chartSeries, setChartSeries] = useState<ChartDataPoint[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [agencyActivity, setAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [previousAgencyActivity, setPreviousAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [routeRows, setRouteRows] = useState<RouteActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const lastActivityLogDocsRef = useRef<QueryDocumentSnapshot<DocumentData>[] | null>(null);
  const lastPreviousActivityLogDocsRef = useRef<QueryDocumentSnapshot<DocumentData>[] | null>(null);
  const agenciesRef = useRef(agencies);
  agenciesRef.current = agencies;

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "agences"))
      .then((agencesSnap) => {
        setAgencies(
          agencesSnap.docs.map((d) => {
            const data = d.data() as { nom?: string; nomAgence?: string };
            return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
          })
        );
      })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      lastActivityLogDocsRef.current = null;
      lastPreviousActivityLogDocsRef.current = null;
      setLogActivity(null);
      setPreviousLogActivity(null);
      setChartSeries([]);
      setAgencyActivity([]);
      setPreviousAgencyActivity([]);
      setRouteRows([]);
      setActivityLoading(false);
      return;
    }

    setActivityLoading(true);
    Promise.all([
      queryActivityLogsInRange(companyId, periodStart, periodEnd),
      queryActivityLogsInRange(companyId, previousPeriodStart, previousPeriodEnd),
    ])
      .then(([docs, previousDocs]) => {
        lastActivityLogDocsRef.current = docs;
        lastPreviousActivityLogDocsRef.current = previousDocs;
        setLogActivity(aggregateActivityLogDocs(docs));
        setPreviousLogActivity(aggregateActivityLogDocs(previousDocs));
        setChartSeries(buildNetworkChartDataFromActivityLogDocs(docs, startStr, endStr, TZ_BAMAKO));
        setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agenciesRef.current));
        setPreviousAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(previousDocs, agenciesRef.current));
        setRouteRows(aggregateRouteActivityRowsFromDocs(docs));
      })
      .catch(() => {
        lastActivityLogDocsRef.current = null;
        lastPreviousActivityLogDocsRef.current = null;
        setLogActivity(null);
        setPreviousLogActivity(null);
        setChartSeries([]);
        setAgencyActivity([]);
        setPreviousAgencyActivity([]);
        setRouteRows([]);
      })
      .finally(() => setActivityLoading(false));
  }, [
    companyId,
    periodStart.getTime(),
    periodEnd.getTime(),
    previousPeriodStart.getTime(),
    previousPeriodEnd.getTime(),
    startStr,
    endStr,
  ]);

  useEffect(() => {
    if (!companyId) return;
    const docs = lastActivityLogDocsRef.current;
    if (docs) {
      setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agencies));
    }
    const previousDocs = lastPreviousActivityLogDocsRef.current;
    if (previousDocs) {
      setPreviousAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(previousDocs, agencies));
    }
  }, [agencies, companyId]);

  const caTotal = logActivity?.totalAmount ?? 0;
  const billetsPlaces = logActivity?.billets.tickets ?? 0;
  const colisCount = logActivity?.courier.parcels ?? 0;
  const previousCaTotal = previousLogActivity?.totalAmount ?? 0;
  const previousBilletsPlaces = previousLogActivity?.billets.tickets ?? 0;
  const previousColisCount = previousLogActivity?.courier.parcels ?? 0;

  const activeAgenciesCount = useMemo(
    () => agencyActivity.filter((a) => a.ventes > 0 || a.colis > 0).length,
    [agencyActivity]
  );
  const previousActiveAgenciesCount = useMemo(
    () => previousAgencyActivity.filter((a) => a.ventes > 0 || a.colis > 0).length,
    [previousAgencyActivity]
  );

  const agencyRowsWithNames = useMemo(() => {
    const name = (id: string) => agencies.find((a) => a.id === id)?.nom ?? id;
    return agencyActivity.map((row) => ({
      ...row,
      name: name(row.agencyId),
    }));
  }, [agencyActivity, agencies]);

  const agencyAnalytics = useMemo(() => {
    const prevByAgency = new Map(previousAgencyActivity.map((row) => [row.agencyId, row]));
    const ranked = agencyRowsWithNames
      .map((row) => {
        const previous = prevByAgency.get(row.agencyId);
        const previousVentes = previous?.ventes ?? 0;
        const transactions = row.placesGuichet + row.placesOnline + row.colis;
        const previousTransactions = (previous?.placesGuichet ?? 0) + (previous?.placesOnline ?? 0) + (previous?.colis ?? 0);
        const deltaPercent = computeDeltaPercent(row.ventes, previousVentes);

        let badgeLabel = "";
        let badgeTone: AgencyBadgeTone = "neutral";
        if (transactions <= 0) {
          badgeLabel = "Critique";
          badgeTone = "critical";
        } else if (deltaPercent != null && deltaPercent <= -20) {
          badgeLabel = "Critique";
          badgeTone = "critical";
        } else if (deltaPercent != null && deltaPercent < -5) {
          badgeLabel = "En baisse";
          badgeTone = "negative";
        }

        return {
          ...row,
          transactions,
          previousTransactions,
          deltaPercent,
          badgeLabel,
          badgeTone,
        };
      })
      .sort((a, b) => {
        if (b.ventes !== a.ventes) return b.ventes - a.ventes;
        return (b.deltaPercent ?? 0) - (a.deltaPercent ?? 0);
      });

    return ranked.map((row, index) =>
      index === 0 && row.ventes > 0
        ? {
            ...row,
            badgeLabel: "TOP performer",
            badgeTone: "top" as AgencyBadgeTone,
          }
        : row
    );
  }, [agencyRowsWithNames, previousAgencyActivity]);

  const caDelta = computeDeltaPercent(caTotal, previousCaTotal);
  const billetsDelta = computeDeltaPercent(billetsPlaces, previousBilletsPlaces);
  const colisDelta = computeDeltaPercent(colisCount, previousColisCount);
  const activeAgencyDelta = computeDeltaPercent(activeAgenciesCount, previousActiveAgenciesCount);
  const activeAgencyCoverage = agencies.length > 0 ? (activeAgenciesCount / agencies.length) * 100 : 0;

  const caTone = signalToneFromDelta(caTotal, previousCaTotal, { zeroIsWarning: true });
  const billetsTone = signalToneFromDelta(billetsPlaces, previousBilletsPlaces, { zeroIsWarning: true });
  const colisTone = signalToneFromDelta(colisCount, previousColisCount, { zeroIsWarning: true });
  const activeAgencyTone: SignalTone =
    activeAgenciesCount <= 0 ? "negative" : activeAgencyCoverage >= 70 ? "positive" : activeAgencyCoverage >= 40 ? "neutral" : "negative";

  const kpiCardClass = cn(
    "!shadow-sm hover:!shadow-md !transition-shadow !border-gray-200 dark:!border-gray-700",
    "border-l-[4px] bg-white dark:bg-gray-900"
  );
  const kpiIconWrap = cn(
    "!h-10 !w-10 !rounded-xl",
    "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
  );
  const kpiValueClass = "!text-2xl !font-bold sm:!text-3xl";

  const kpiToneBorderClass = (tone: SignalTone) =>
    tone === "positive"
      ? "border-l-emerald-500"
      : tone === "negative"
        ? "border-l-rose-500"
        : "border-l-slate-400";

  const trendBars = useMemo(() => {
    const source =
      chartSeries.length > 0
        ? chartSeries
        : [{ date: startStr, revenue: caTotal, reservations: billetsPlaces }];
    const maxBars = 24;
    const sampled =
      source.length <= maxBars
        ? source
        : Array.from({ length: maxBars }, (_, i) => source[Math.floor((i * source.length) / maxBars)]);
    const maxRevenue = Math.max(...sampled.map((item) => item.revenue), 1);
    return sampled.map((item, index) => ({
      key: `${item.date}-${index}`,
      amount: item.revenue,
      height: Math.max(10, Math.round((item.revenue / maxRevenue) * 100)),
    }));
  }, [chartSeries, startStr, caTotal, billetsPlaces]);

  if (!companyId) {
    return (
      <StandardLayoutWrapper maxWidthClass={pageMaxWidthFluid} className="bg-gray-50 dark:bg-gray-950">
        <PageHeader title="Activite reseau" />
        <p className="text-sm text-muted-foreground">Identifiant de compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  const basePath = `/compagnie/${companyId}`;
  const hasNetworkWarning = caTone === "negative" || activeAgencyTone === "negative";
  const focusAgencySection = () => {
    const el = document.getElementById("reseau-par-agence");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <StandardLayoutWrapper maxWidthClass={pageMaxWidthFluid} className="bg-gray-50 dark:bg-gray-950">
      <div className="space-y-3 pb-3">
        <PageHeader
          title="Activite reseau"
          breadcrumb={[
            { label: "Dashboard", path: `${basePath}/command-center` },
            { label: "Activite reseau" },
          ]}
          subtitle={
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-gray-100">{periodLabel}</span>
              <span className="mx-2 text-gray-300 dark:text-gray-600" aria-hidden>
                .
              </span>
              Comparatif: {previousPeriodLabel}
            </span>
          }
          right={
            <NetworkActivityPeriodBar
              preset={globalPeriod.preset}
              startDate={globalPeriod.startDate}
              endDate={globalPeriod.endDate}
              setPreset={globalPeriod.setPreset}
              setCustomRange={globalPeriod.setCustomRange}
            />
          }
        />

        {!isOnline && <PageOfflineState message="Connexion instable: les donnees peuvent etre incompletes." />}

        <section className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Montant encaisse"
            value={activityLoading ? "..." : money(caTotal)}
            icon={TrendingUp}
            className={cn(kpiCardClass, kpiToneBorderClass(caTone))}
            iconWrapperClassName={kpiIconWrap}
            valueClassName={kpiValueClass}
            hint={kpiSignalLabel(caTone)}
            variation={activityLoading ? undefined : formatDeltaPercent(caDelta) ?? undefined}
            variationLabel="vs periode precedente"
          />
          <MetricCard
            label="Billets"
            value={activityLoading ? "..." : String(billetsPlaces)}
            icon={Ticket}
            className={cn(kpiCardClass, kpiToneBorderClass(billetsTone))}
            iconWrapperClassName={kpiIconWrap}
            valueClassName={kpiValueClass}
            hint={kpiSignalLabel(billetsTone)}
            variation={activityLoading ? undefined : formatDeltaPercent(billetsDelta) ?? undefined}
            variationLabel="vs periode precedente"
          />
          <MetricCard
            label="Colis"
            value={activityLoading ? "..." : String(colisCount)}
            icon={Package}
            className={cn(kpiCardClass, kpiToneBorderClass(colisTone))}
            iconWrapperClassName={kpiIconWrap}
            valueClassName={kpiValueClass}
            hint={kpiSignalLabel(colisTone)}
            variation={activityLoading ? undefined : formatDeltaPercent(colisDelta) ?? undefined}
            variationLabel="vs periode precedente"
          />
          <MetricCard
            label="Agences actives"
            value={activityLoading ? "..." : `${activeAgenciesCount} / ${agencies.length || 0}`}
            icon={Building2}
            className={cn(kpiCardClass, kpiToneBorderClass(activeAgencyTone))}
            iconWrapperClassName={kpiIconWrap}
            valueClassName={kpiValueClass}
            hint={kpiSignalLabel(activeAgencyTone)}
            variation={activityLoading ? undefined : formatDeltaPercent(activeAgencyDelta) ?? undefined}
            variationLabel="vs periode precedente"
          />
        </section>

        <div id="reseau-par-agence">
          <SectionCard
          title="Par agence"
          icon={Building2}
          className="rounded-xl border-0 bg-white shadow-sm dark:bg-gray-900"
          description="Classement automatique du top performer vers les agences les plus faibles."
          help={<InfoTooltip label="Montant, volume et variation par agence pour prioriser les actions terrain." />}
        >
          {activityLoading ? (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
              ))}
            </div>
          ) : agencyAnalytics.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
              Aucune activite agence sur cette periode. Verifiez les ouvertures de guichet et la disponibilite des trajets.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
              {agencyAnalytics.map((agency, index) => {
                const ventesFormatted = money(agency.ventes);
                const deltaLabel = formatDeltaPercent(agency.deltaPercent) ?? "0%";
                return (
                  <article
                    key={agency.agencyId}
                    className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {index + 1}. {agency.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {agency.transactions} transactions
                        </p>
                      </div>
                      {agency.badgeLabel ? (
                        <span
                          className={cn(
                            "inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            signalBadgeClass(agency.badgeTone)
                          )}
                        >
                          {agency.badgeLabel}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <p
                        className="truncate text-base font-semibold tabular-nums text-slate-900 dark:text-white"
                        title={ventesFormatted}
                      >
                        {ventesFormatted}
                      </p>
                      <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", deltaToneClass(agency.deltaPercent))}>
                        {agency.deltaPercent != null && agency.deltaPercent > 0 ? (
                          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        ) : agency.deltaPercent != null && agency.deltaPercent < 0 ? (
                          <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Minus className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {deltaLabel}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          </SectionCard>
        </div>

        <Card className="mb-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="px-3 pb-2 pt-3 md:px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Detail par trajet</CardTitle>
              <InfoTooltip label="Synthese billets, colis et montant par trajet sur la periode." />
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
            {activityLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                ))}
              </div>
            ) : routeRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
                Aucun flux sur les trajets de cette periode. Verifiez la publication des departs et le suivi agence.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[680px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left dark:border-slate-600">
                      <th className="whitespace-nowrap py-2 pr-3">Trajet</th>
                      <th className="whitespace-nowrap py-2 pr-3 text-right">Billets</th>
                      <th className="whitespace-nowrap py-2 pr-3 text-right">Colis</th>
                      <th className="whitespace-nowrap py-2 text-right">CA activite</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeRows.map((row) => (
                      <tr key={row.trajet} className="border-b border-slate-100 dark:border-slate-800">
                        <td className="whitespace-nowrap py-2 pr-3 font-medium">{row.trajet}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right">{row.billets}</td>
                        <td className="whitespace-nowrap py-2 pr-3 text-right">{row.colis}</td>
                        <td className="whitespace-nowrap py-2 text-right">{money(row.caActivite)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="px-3 pb-2 pt-3 md:px-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">Tendance reseau</CardTitle>
              <InfoTooltip label="Lecture rapide de la tendance de revenu sur la periode (format sparkline)." />
            </div>
            <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
              Objectif: detecter en quelques secondes une hausse, une baisse ou une activite nulle.
            </p>
          </CardHeader>
          <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
            {activityLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {caTone === "positive"
                      ? "Dynamique en hausse"
                      : caTone === "negative"
                        ? "Baisse d'activite a traiter"
                        : "Activite stable"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                      caTone === "positive" &&
                        "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200",
                      caTone === "neutral" &&
                        "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
                      caTone === "negative" &&
                        "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200"
                    )}
                  >
                    {caTone === "negative" ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : null}
                    {formatDeltaPercent(caDelta) ?? "0%"} vs periode precedente
                  </span>
                </div>

                <div className="flex h-16 items-end gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
                  {trendBars.map((bar) => (
                    <span
                      key={bar.key}
                      className={cn(
                        "w-full min-w-[3px] rounded-sm",
                        caTone === "positive" && "bg-emerald-400/85 dark:bg-emerald-500/75",
                        caTone === "neutral" && "bg-slate-400/85 dark:bg-slate-500/75",
                        caTone === "negative" && "bg-orange-400/85 dark:bg-orange-500/75"
                      )}
                      style={{ height: `${bar.height}%` }}
                      title={money(bar.amount)}
                    />
                  ))}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Montant de la periode: <span className="font-semibold">{money(caTotal)}</span>. Le sparkline
                  represente la cadence de revenu sur la plage selectionnee.
                </p>
                {hasNetworkWarning ? (
                  <button
                    type="button"
                    onClick={focusAgencySection}
                    className="inline-flex w-fit items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100 dark:hover:bg-orange-900/45"
                  >
                    Verifier agences en baisse
                  </button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StandardLayoutWrapper>
  );
}
