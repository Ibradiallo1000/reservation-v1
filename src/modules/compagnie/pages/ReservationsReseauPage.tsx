/**
 * Activite reseau CEO — domaine operationnel consolide.
 * Source courte periode : activityLogs. Source longue periode : dailyStats via services existants.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  type Timestamp,
} from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  Globe2,
  Minus,
  Package,
  Route,
  Target,
  Ticket,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { PageOfflineState } from "@/shared/ui/PageStates";
import { Skeleton } from "@/shared/ui/skeleton";
import { StandardLayoutWrapper } from "@/ui";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import {
  aggregateActivityLogDocs,
  debugCommercialActivityPipeline,
  getUnifiedCommercialActivity,
  parseCommercialActivityLog,
  shouldPreferActivityLogsOverDailyStats,
  shouldUseDailyStatsForActivity,
  summarizeActivityLogDocs,
  summarizeCommercialActivity,
} from "@/modules/compagnie/networkStats/activityCore";
import {
  buildNetworkChartDataFromActivityLogDocs,
  getNetworkCapacityOnly,
  getNetworkStatsChartData,
  type ChartDataPoint,
} from "@/modules/compagnie/networkStats/networkStatsService";
import {
  aggregateNetworkActivityByAgencyFromDocs,
  aggregateRouteActivityRowsFromDocs,
  getNetworkActivityByAgency,
  type AgencyActivityRow,
  type RouteActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import {
  getEndOfDayInBamako,
  getStartOfDayInBamako,
  getTodayBamako,
  TZ_BAMAKO,
} from "@/shared/date/dateUtilsTz";
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";
import { getInclusiveRangeDays, isInteractiveRangeTooLarge, largeRangeMessage } from "@/shared/date/periodUtils";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";

dayjs.extend(utc);
dayjs.extend(timezone);

type Company = {
  id: string;
  nom?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
};

type CommercialActivity = Awaited<ReturnType<typeof aggregateActivityLogDocs>>;

type AgencyNamedRow = AgencyActivityRow & {
  name: string;
  transactions: number;
  previousVentes: number;
  evolutionPct: number | null;
  dominantChannel: string;
  bestRoute: string;
  decision: string;
  status: "excellent" | "stable" | "support";
};

type RouteDecisionRow = RouteActivityRow & {
  previousCa: number;
  evolutionPct: number | null;
  agenciesCount: number;
  fillRateLabel: string;
  status: "performant" | "stable" | "support";
  decision: string;
};

type RecentActivity = {
  id: string;
  agencyName: string;
  label: string;
  amount: number;
  timeLabel: string;
  tone: "guichet" | "online" | "courier";
};

type DecisionCard = {
  label: string;
  value: string;
  detail: string;
  decision: string;
  tone: "green" | "blue" | "orange" | "red" | "neutral";
  icon: React.ReactNode;
  onClick?: () => void;
};

type DiagnosticItem = {
  title: string;
  cause: string;
  impact: string;
  action: string;
  tone: "green" | "orange" | "red" | "blue";
  onClick?: () => void;
};

function getDateKey(d: Date): string {
  return dayjs(d).tz(TZ_BAMAKO).format("YYYY-MM-DD");
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(value) || 0));
}

function percent(value: number, total: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function trendLabel(value: number | null): string {
  if (value == null) return "N/A";
  if (value > 0) return `+${value}%`;
  if (value < 0) return `${value}%`;
  return "0%";
}

function trendIcon(value: number | null) {
  if (value == null || value === 0) return <Minus className="h-3.5 w-3.5" />;
  if (value > 0) return <TrendingUp className="h-3.5 w-3.5" />;
  return <TrendingDown className="h-3.5 w-3.5" />;
}

function trendClass(value: number | null): string {
  if (value == null || value === 0) return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300";
  if (value > 0) return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100";
  return "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-100";
}

function previousPeriod(dateFrom: string, dateTo: string): { dateFrom: string; dateTo: string } {
  const start = dayjs.tz(`${dateFrom}T12:00:00`, TZ_BAMAKO);
  const end = dayjs.tz(`${dateTo}T12:00:00`, TZ_BAMAKO);
  const days = Math.max(1, end.diff(start, "day") + 1);
  return {
    dateFrom: start.subtract(days, "day").format("YYYY-MM-DD"),
    dateTo: end.subtract(days, "day").format("YYYY-MM-DD"),
  };
}

function emptyChart(startStr: string, endStr: string): ChartDataPoint[] {
  if (startStr === endStr) {
    return Array.from({ length: 24 }, (_, h) => ({
      date: `${startStr}T${String(h).padStart(2, "0")}`,
      revenue: 0,
      reservations: 0,
    }));
  }
  const rows: ChartDataPoint[] = [];
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T23:59:59`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    rows.push({ date: getDateKey(new Date(t)), revenue: 0, reservations: 0 });
  }
  return rows;
}

function statusLabel(status: AgencyNamedRow["status"]): string {
  if (status === "excellent") return "Excellent";
  if (status === "support") return "A accompagner";
  return "Stable";
}

function statusClass(status: AgencyNamedRow["status"]): string {
  if (status === "excellent") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100";
  }
  if (status === "support") {
    return "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100";
  }
  return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300";
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function DecisionSummaryCard({ item }: { item: DecisionCard }) {
  return (
    <button
      type="button"
      onClick={item.onClick}
      className={cn(
        "flex min-h-[132px] flex-col justify-between rounded-xl border p-4 text-left shadow-sm transition",
        item.onClick && "hover:-translate-y-0.5 hover:shadow-md",
        item.tone === "green" &&
          "border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100",
        item.tone === "blue" &&
          "border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-100",
        item.tone === "orange" &&
          "border-orange-200 bg-orange-50/80 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/25 dark:text-orange-100",
        item.tone === "red" &&
          "border-red-200 bg-red-50/80 text-red-950 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-100",
        item.tone === "neutral" &&
          "border-slate-200 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{item.label}</p>
          <p className="mt-2 text-xl font-bold leading-tight break-words">{item.value}</p>
          <p className="mt-1 line-clamp-2 text-xs opacity-75">{item.detail}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/70 text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-100">
          {item.icon}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-white/65 px-3 py-2 text-xs font-semibold dark:bg-slate-950/35">
        <span className="line-clamp-2">{item.decision}</span>
        {item.onClick && <ArrowRight className="h-4 w-4 shrink-0" />}
      </div>
    </button>
  );
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5", className)}>
      {children}
    </section>
  );
}

export default function ReservationsReseauPage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();

  const startStr = globalPeriod.startDate;
  const endStr = globalPeriod.endDate;
  const periodLabel = useMemo(
    () => formatActivityPeriodLabelFr(startStr, endStr, getTodayBamako()),
    [startStr, endStr]
  );

  const [company, setCompany] = useState<Company | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [activity, setActivity] = useState<CommercialActivity | null>(null);
  const [previousActivity, setPreviousActivity] = useState<CommercialActivity | null>(null);
  const [chartSeries, setChartSeries] = useState<ChartDataPoint[]>([]);
  const [agencyActivity, setAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [previousAgencyActivity, setPreviousAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [routeRows, setRouteRows] = useState<RouteActivityRow[]>([]);
  const [previousRouteRows, setPreviousRouteRows] = useState<RouteActivityRow[]>([]);
  const [routeAgencyCounts, setRouteAgencyCounts] = useState<Record<string, number>>({});
  const [agencyBestRoutes, setAgencyBestRoutes] = useState<Record<string, string>>({});
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [agencyTransactionCounts, setAgencyTransactionCounts] = useState<Record<string, number>>({});
  const [networkCapacity, setNetworkCapacity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<"logs" | "dailyStats" | "limited">("logs");
  const [selectedAgencyDetailId, setSelectedAgencyDetailId] = useState<string | null>(null);

  const reservationsPath = (canal?: "guichet" | "digital" | "courrier") =>
    `/compagnie/${companyId}/reservations${canal ? `?canal=${canal}` : ""}`;
  const agencyPerformancePath = (agencyId?: string) =>
    `/compagnie/${companyId}/performance-agence${agencyId ? `?agency=${encodeURIComponent(agencyId)}` : ""}`;
  const routePerformancePath = (trajet?: string) =>
    `/compagnie/${companyId}/performance-trajet${trajet ? `?route=${encodeURIComponent(trajet)}` : ""}`;
  const canalFromLabel = (label?: string): "guichet" | "digital" | "courrier" | undefined => {
    if (label === "Guichet") return "guichet";
    if (label === "En ligne") return "digital";
    if (label === "Courrier") return "courrier";
    return undefined;
  };

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    Promise.all([
      getDoc(doc(db, "companies", companyId)),
      getDocs(collection(db, "companies", companyId, "agences")),
    ])
      .then(([companySnap, agencesSnap]) => {
        if (cancelled) return;
        if (companySnap.exists()) {
          setCompany({ id: companyId, ...(companySnap.data() as Omit<Company, "id">) });
        }
        setAgencies(
          agencesSnap.docs.map((d) => {
            const data = d.data() as { nom?: string; nomAgence?: string };
            return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
          })
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const agencyName = (id: string) => agencies.find((a) => a.id === id)?.nom ?? id;

    async function load() {
      setLoading(true);
      setRangeError(null);
      try {
        const periodStart = getStartOfDayInBamako(startStr);
        const periodEnd = getEndOfDayInBamako(endStr);

        if (isInteractiveRangeTooLarge(periodStart, periodEnd)) {
          setDetailMode("limited");
          setRangeError(largeRangeMessage());
          setActivity(null);
          setPreviousActivity(null);
          setChartSeries([]);
          setAgencyActivity([]);
          setPreviousAgencyActivity([]);
          setRouteRows([]);
          setPreviousRouteRows([]);
          setRouteAgencyCounts({});
          setAgencyBestRoutes({});
          setRecentActivity([]);
          setAgencyTransactionCounts({});
          setNetworkCapacity(null);
          return;
        }

        const useDailyStats = shouldUseDailyStatsForActivity(periodStart, periodEnd);
        const previous = previousPeriod(startStr, endStr);
        const previousStart = getStartOfDayInBamako(previous.dateFrom);
        const previousEnd = getEndOfDayInBamako(previous.dateTo);
        const safeNetworkCapacity = getNetworkCapacityOnly(companyId, startStr, endStr).catch(() => null);

        const applyLogsData = (
          docs: Awaited<ReturnType<typeof queryActivityLogsInRange>>,
          previousDocs: Awaited<ReturnType<typeof queryActivityLogsInRange>>,
          capacity: number | null
        ) => {
          const transactionCountByAgency = new Map<string, number>();
          const routeAgencies = new Map<string, Set<string>>();
          const agencyRouteAmounts = new Map<string, Map<string, number>>();
          docs.forEach((d) => {
            const data = d.data() as Record<string, unknown>;
            const parsed = parseCommercialActivityLog(data);
            if (!parsed) return;
            const dep = String(data.depart ?? "").trim();
            const arr = String(data.arrivee ?? "").trim();
            const routeKey = dep && arr ? `${dep} → ${arr}` : "Autres";
            const agenciesForRoute = routeAgencies.get(routeKey) ?? new Set<string>();
            agenciesForRoute.add(parsed.agencyId);
            routeAgencies.set(routeKey, agenciesForRoute);
            const agencyRoutes = agencyRouteAmounts.get(parsed.agencyId) ?? new Map<string, number>();
            agencyRoutes.set(routeKey, (agencyRoutes.get(routeKey) ?? 0) + parsed.amount);
            agencyRouteAmounts.set(parsed.agencyId, agencyRoutes);
          });
          const bestRoutesByAgency = Object.fromEntries(
            Array.from(agencyRouteAmounts.entries()).map(([agencyId, routes]) => {
              const best = Array.from(routes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Non disponible";
              return [agencyId, best];
            })
          );
          const recent = [...docs]
            .reverse()
            .map((d) => {
              const data = d.data() as Record<string, unknown>;
              const parsed = parseCommercialActivityLog(data);
              if (!parsed) return null;
              transactionCountByAgency.set(parsed.agencyId, (transactionCountByAgency.get(parsed.agencyId) ?? 0) + 1);
              const type = String(data.type ?? "");
              const source = String(data.source ?? "");
              const createdAt = (data.createdAt as Timestamp | undefined)?.toDate?.() ?? new Date(0);
              const label =
                type === "courier"
                  ? "Colis traite"
                  : source === "online"
                    ? "Reservation en ligne validee"
                    : "Billet guichet vendu";
              return {
                id: d.id,
                agencyName: agencyName(parsed.agencyId),
                label,
                amount: parsed.amount,
                timeLabel: dayjs(createdAt).tz(TZ_BAMAKO).format("HH:mm"),
                tone: type === "courier" ? "courier" : source === "online" ? "online" : "guichet",
              } satisfies RecentActivity;
            })
            .filter(Boolean)
            .slice(0, 8) as RecentActivity[];

          setDetailMode("logs");
          const logsActivity = aggregateActivityLogDocs(docs);
          setActivity(logsActivity);
          setPreviousActivity(aggregateActivityLogDocs(previousDocs));
          setChartSeries(buildNetworkChartDataFromActivityLogDocs(docs, startStr, endStr, TZ_BAMAKO));
          const rowsFromLogs = aggregateNetworkActivityByAgencyFromDocs(docs, agencies).map((row) => ({
              ...row,
              placesGuichet: row.placesGuichet,
              placesOnline: row.placesOnline,
            }));
          setAgencyActivity(rowsFromLogs);
          setPreviousAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(previousDocs, agencies));
          setRouteRows(aggregateRouteActivityRowsFromDocs(docs));
          setPreviousRouteRows(aggregateRouteActivityRowsFromDocs(previousDocs));
          setRouteAgencyCounts(Object.fromEntries(Array.from(routeAgencies.entries()).map(([route, set]) => [route, set.size])));
          setAgencyBestRoutes(bestRoutesByAgency);
          setRecentActivity(recent);
          setAgencyTransactionCounts(Object.fromEntries(transactionCountByAgency));
          setNetworkCapacity(capacity);
          debugCommercialActivityPipeline("ReservationsReseauPage.finalToUI", {
            companyId,
            period: { dateFrom: startStr, dateTo: endStr },
            sourceRetenue: "activityLogs",
            activityLogs: summarizeActivityLogDocs(docs),
            resultFinalReservationsReseau: summarizeCommercialActivity(logsActivity),
            agencyRows: rowsFromLogs,
            routeRows: aggregateRouteActivityRowsFromDocs(docs),
          });
        };

        if (useDailyStats) {
          setDetailMode("dailyStats");
          const [activityRes, chartRes, agencyRows, capacity] = await Promise.all([
            getUnifiedCommercialActivity(companyId, { dateFrom: startStr, dateTo: endStr }, { timeZone: TZ_BAMAKO }),
            getNetworkStatsChartData(companyId, startStr, endStr),
            getNetworkActivityByAgency(companyId, periodStart, periodEnd, agencies),
            safeNetworkCapacity,
          ]);
          const [previousActivityRes, previousAgencyRows] = await Promise.all([
            getUnifiedCommercialActivity(companyId, previous, { timeZone: TZ_BAMAKO }).catch(() => null),
            getNetworkActivityByAgency(companyId, previousStart, previousEnd, agencies).catch(() => [] as AgencyActivityRow[]),
          ]);
          if (cancelled) return;
          if (getInclusiveRangeDays(periodStart, periodEnd) <= 31) {
            const [fallbackDocs, fallbackPreviousDocs] = await Promise.all([
              queryActivityLogsInRange(companyId, periodStart, periodEnd).catch(() => []),
              queryActivityLogsInRange(companyId, previousStart, previousEnd).catch(() => []),
            ]);
            const logsActivity = aggregateActivityLogDocs(fallbackDocs);
            if (fallbackDocs.length > 0 && shouldPreferActivityLogsOverDailyStats(activityRes, logsActivity)) {
              debugCommercialActivityPipeline("ReservationsReseauPage.sourceSelected", {
                companyId,
                period: { dateFrom: startStr, dateTo: endStr },
                sourceRetenue: "activityLogs",
                dailyStats: summarizeCommercialActivity(activityRes),
                activityLogs: summarizeActivityLogDocs(fallbackDocs),
              });
              if (cancelled) return;
              applyLogsData(fallbackDocs, fallbackPreviousDocs, capacity);
              return;
            }
          }
          setActivity(activityRes);
          setPreviousActivity(previousActivityRes);
          setChartSeries(chartRes);
          setAgencyActivity(agencyRows);
          setPreviousAgencyActivity(previousAgencyRows);
          setRouteRows([]);
          setPreviousRouteRows([]);
          setRouteAgencyCounts({});
          setAgencyBestRoutes({});
          setRecentActivity([]);
          setAgencyTransactionCounts({});
          setNetworkCapacity(capacity);
          debugCommercialActivityPipeline("ReservationsReseauPage.finalToUI", {
            companyId,
            period: { dateFrom: startStr, dateTo: endStr },
            sourceRetenue: "dailyStats",
            resultFinalReservationsReseau: summarizeCommercialActivity(activityRes),
            agencyRows,
          });
          return;
        }

        setDetailMode("logs");
        const [docs, capacity] = await Promise.all([
          queryActivityLogsInRange(companyId, periodStart, periodEnd),
          safeNetworkCapacity,
        ]);
        const previousDocs = await queryActivityLogsInRange(companyId, previousStart, previousEnd).catch(() => []);
        if (cancelled) return;
        applyLogsData(docs, previousDocs, capacity);
      } catch (error) {
        console.error("[ReservationsReseauPage]", error);
        if (cancelled) return;
        setActivity(null);
        setPreviousActivity(null);
        setChartSeries([]);
        setAgencyActivity([]);
        setPreviousAgencyActivity([]);
        setRouteRows([]);
        setPreviousRouteRows([]);
        setRouteAgencyCounts({});
        setAgencyBestRoutes({});
        setRecentActivity([]);
        setAgencyTransactionCounts({});
        setNetworkCapacity(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [agencies, companyId, endStr, startStr]);

  const caTotal = activity?.totalAmount ?? 0;
  const previousCaTotal = previousActivity?.totalAmount ?? 0;
  const guichetAmount = activity?.billets.guichet.amount ?? 0;
  const onlineAmount = activity?.billets.online.amount ?? 0;
  const courierAmount = activity?.courier.amount ?? 0;
  const previousGuichetAmount = previousActivity?.billets.guichet.amount ?? 0;
  const previousOnlineAmount = previousActivity?.billets.online.amount ?? 0;
  const previousCourierAmount = previousActivity?.courier.amount ?? 0;
  const billetsPlaces = activity?.billets.tickets ?? 0;
  const guichetTransactions = activity?.billets.guichet.reservationCount ?? 0;
  const onlineTransactions = activity?.billets.online.reservationCount ?? 0;
  const colisCount = activity?.courier.parcels ?? 0;
  const totalNetworkCapacity = networkCapacity ?? 0;
  const fillRate = totalNetworkCapacity > 0 ? Math.round((billetsPlaces / totalNetworkCapacity) * 100) : null;
  const hasActivity = caTotal > 0 || billetsPlaces > 0 || colisCount > 0;
  const globalTrend = deltaPct(caTotal, previousCaTotal);

  const agencyRows = useMemo<AgencyNamedRow[]>(() => {
    const active = agencyActivity.filter((a) => a.ventes > 0 || a.billets > 0 || a.colis > 0);
    const avg = active.length > 0 ? active.reduce((sum, a) => sum + a.ventes, 0) / active.length : 0;
    const previousByAgency = new Map(previousAgencyActivity.map((row) => [row.agencyId, row]));
    return agencyActivity
      .map((row) => {
        const prev = previousByAgency.get(row.agencyId);
        const evolutionPct = deltaPct(row.ventes, prev?.ventes ?? 0);
        const transactions =
          detailMode === "logs"
            ? agencyTransactionCounts[row.agencyId] ?? 0
            : row.billets + row.colis;
        const dominantChannel =
          row.colis > row.placesGuichet && row.colis > row.placesOnline
            ? "Courrier"
            : row.placesOnline > row.placesGuichet
              ? "Digital"
              : "Guichet";
        const status: AgencyNamedRow["status"] =
          (prev?.ventes ?? 0) > 0 && row.ventes <= 0
            ? "support"
            : evolutionPct != null && evolutionPct <= -15
              ? "support"
              : row.ventes <= 0 && row.billets <= 0 && row.colis <= 0
                ? "support"
                : avg > 0 && row.ventes >= avg * 1.2 && (evolutionPct == null || evolutionPct >= 0)
              ? "excellent"
              : "stable";
        const decision =
          status === "excellent"
            ? "Maintenir la strategie actuelle et documenter ce qui fonctionne."
            : status === "support"
              ? "Accompagner cette agence et verifier le canal ou le trajet dominant."
              : "Surveiller l'evolution sans action urgente.";
        return {
          ...row,
          name: agencies.find((a) => a.id === row.agencyId)?.nom ?? row.agencyId,
          transactions,
          previousVentes: prev?.ventes ?? 0,
          evolutionPct,
          dominantChannel,
          bestRoute: agencyBestRoutes[row.agencyId] ?? (detailMode === "logs" ? "Non disponible" : "Indisponible sur dailyStats"),
          decision,
          status,
        };
      })
      .filter((row) => agencies.length <= 1 || row.ventes > 0 || row.billets > 0 || row.colis > 0 || row.status === "support")
      .sort((a, b) => b.ventes - a.ventes);
  }, [agencies, agencyActivity, agencyBestRoutes, agencyTransactionCounts, detailMode, previousAgencyActivity]);
  const selectedAgencyDetail =
    agencyRows.find((agency) => agency.agencyId === selectedAgencyDetailId) ?? agencyRows[0] ?? null;

  const channelRows = [
    {
      label: "Guichet",
      amount: guichetAmount,
      previousAmount: previousGuichetAmount,
      volume: guichetTransactions,
      detail: `${compactNumber(activity?.billets.guichet.tickets ?? 0)} place(s)`,
      color: "#059669",
      decision: "Piloter les equipes guichet selon les agences en baisse.",
    },
    {
      label: "En ligne",
      amount: onlineAmount,
      previousAmount: previousOnlineAmount,
      volume: onlineTransactions,
      detail: `${compactNumber(activity?.billets.online.tickets ?? 0)} place(s)`,
      color: "#2563eb",
      decision: "Verifier les agences ou le digital recule.",
    },
    {
      label: "Courrier",
      amount: courierAmount,
      previousAmount: previousCourierAmount,
      volume: colisCount,
      detail: `${compactNumber(colisCount)} colis`,
      color: "#ea580c",
      decision: "Renforcer le suivi courrier si le volume baisse.",
    },
  ];

  const routeDecisionRows = useMemo<RouteDecisionRow[]>(() => {
    const previousByRoute = new Map(previousRouteRows.map((row) => [row.trajet, row]));
    const avg = routeRows.reduce((sum, row) => sum + row.caActivite, 0) / Math.max(routeRows.length, 1);
    return routeRows.map((row, index) => {
      const previous = previousByRoute.get(row.trajet);
      const evolutionPct = deltaPct(row.caActivite, previous?.caActivite ?? 0);
      const status: RouteDecisionRow["status"] =
        index === 0 && row.caActivite > 0 && (evolutionPct == null || evolutionPct >= -5)
          ? "performant"
          : (previous?.caActivite ?? 0) > 0 && (row.caActivite <= 0 || (evolutionPct != null && evolutionPct <= -15))
            ? "support"
            : avg > 0 && row.caActivite <= avg * 0.6
              ? "support"
              : "stable";
      const decision =
        status === "performant"
          ? "Conserver la frequence et analyser les facteurs de performance."
          : status === "support"
            ? "Verifier horaires, frequence ou animation commerciale du trajet."
            : "Maintenir sous observation sur la prochaine periode.";
      return {
        ...row,
        previousCa: previous?.caActivite ?? 0,
        evolutionPct,
        agenciesCount: routeAgencyCounts[row.trajet] ?? 0,
        fillRateLabel: "Non disponible",
        status,
        decision,
      };
    });
  }, [previousRouteRows, routeAgencyCounts, routeRows]);

  const topAgency = agencyRows[0];
  const supportAgency =
    agencyRows.find((agency) => agency.status === "support") ??
    [...agencyRows].sort((a, b) => (a.evolutionPct ?? 0) - (b.evolutionPct ?? 0))[0];
  const topRoute = routeDecisionRows[0];
  const supportRoute = routeDecisionRows.find((route) => route.status === "support");
  const dominantChannel = [...channelRows].sort((a, b) => b.amount - a.amount)[0];
  const decliningChannel = [...channelRows].filter((c) => c.previousAmount > 0).sort((a, b) => (deltaPct(a.amount, a.previousAmount) ?? 0) - (deltaPct(b.amount, b.previousAmount) ?? 0))[0];

  const decisionCards: DecisionCard[] = [
    {
      label: "Qui tire le reseau ?",
      value: loading ? "..." : topAgency?.name ?? "Aucune agence",
      detail: topAgency ? `${money(topAgency.ventes)} · ${trendLabel(topAgency.evolutionPct)}` : "Aucune activite consolidee.",
      decision: topAgency ? topAgency.decision : "Relancer l'activite commerciale.",
      tone: "green",
      icon: <Building2 className="h-5 w-5" />,
      onClick: () => navigate(agencyPerformancePath(topAgency?.agencyId)),
    },
    {
      label: "Qui ralentit ?",
      value: loading ? "..." : supportAgency?.name ?? "Aucun signal",
      detail: supportAgency ? `${money(supportAgency.ventes)} · ${trendLabel(supportAgency.evolutionPct)}` : "Pas de baisse agence exploitable.",
      decision: supportAgency ? supportAgency.decision : "Maintenir la surveillance.",
      tone: supportAgency ? "orange" : "blue",
      icon: <AlertTriangle className="h-5 w-5" />,
      onClick: () => navigate(agencyPerformancePath(supportAgency?.agencyId)),
    },
    {
      label: "Trajet le plus rentable",
      value: loading ? "..." : topRoute?.trajet ?? "Non disponible",
      detail: topRoute ? `${money(topRoute.caActivite)} · ${trendLabel(topRoute.evolutionPct)}` : "Disponible sur les periodes courtes.",
      decision: topRoute ? topRoute.decision : "Lire les trajets sur une periode detaillee.",
      tone: "blue",
      icon: <Route className="h-5 w-5" />,
      onClick: () => navigate(routePerformancePath(topRoute?.trajet)),
    },
    {
      label: "Canal qui explique l'activite",
      value: loading ? "..." : dominantChannel?.label ?? "Aucun canal",
      detail: dominantChannel ? `${percent(dominantChannel.amount, caTotal)}% du CA · ${trendLabel(deltaPct(dominantChannel.amount, dominantChannel.previousAmount))}` : "Aucune repartition.",
      decision: decliningChannel && deltaPct(decliningChannel.amount, decliningChannel.previousAmount)! < 0 ? `${decliningChannel.label} baisse : verifier les agences concernees.` : "Conserver le canal dominant sous controle.",
      tone: decliningChannel && deltaPct(decliningChannel.amount, decliningChannel.previousAmount)! < 0 ? "orange" : "green",
      icon: <Target className="h-5 w-5" />,
      onClick: () => navigate(reservationsPath(canalFromLabel(dominantChannel?.label))),
    },
  ];

  const attentionItems: DiagnosticItem[] = [
    ...agencyRows
      .filter((agency) => agency.status === "support")
      .slice(0, 2)
      .map((agency) => ({
        title: agency.name,
        cause: `${agency.dominantChannel} ou activite agence en baisse (${trendLabel(agency.evolutionPct)}).`,
        impact: agency.previousVentes > agency.ventes ? `Impact estime : -${money(agency.previousVentes - agency.ventes)}.` : "Impact a confirmer sur periode comparable.",
        action: "Verifier l'offre locale, le canal dominant et les trajets de l'agence.",
        tone: "orange" as const,
        onClick: () => navigate(agencyPerformancePath(agency.agencyId)),
      })),
    ...(supportRoute
      ? [{
          title: supportRoute.trajet,
          cause: `Trajet faible ou en baisse (${trendLabel(supportRoute.evolutionPct)}).`,
          impact: supportRoute.previousCa > supportRoute.caActivite ? `Impact estime : -${money(supportRoute.previousCa - supportRoute.caActivite)}.` : "Impact financier a confirmer.",
          action: "Verifier horaires, frequence et agences exploitantes.",
          tone: "red" as const,
          onClick: () => navigate(routePerformancePath(supportRoute.trajet)),
        }]
      : []),
    ...(fillRate != null && fillRate < 35
      ? [{
          title: "Remplissage reseau faible",
          cause: `${fillRate}% de remplissage global sur la periode.`,
          impact: "Capacite disponible sous-utilisee.",
          action: "Analyser les trajets faibles avant d'ajuster la frequence.",
          tone: "red" as const,
          onClick: () => navigate(`/compagnie/${companyId}/flotte?tab=exploitation`),
        }]
      : []),
    ...(detailMode !== "logs"
      ? [{
          title: "Detail operationnel limite",
          cause: "La periode utilise dailyStats.",
          impact: "Trajets, chronologie et split digital detaille sont incomplets.",
          action: "Passer sur une periode courte pour investiguer finement.",
          tone: "blue" as const,
        }]
      : []),
    ...(hasActivity
      ? []
      : [{
          title: "Aucune activite consolidee",
          cause: "Aucun billet ou colis confirme sur la periode.",
          impact: "Le reseau ne genere pas de CA operationnel visible.",
          action: "Verifier l'ouverture des agences et les ventes de la journee.",
          tone: "red" as const,
          onClick: () => navigate(agencyPerformancePath()),
        }]),
  ].slice(0, 5);

  if (!companyId) {
    return (
      <StandardLayoutWrapper maxWidthClass="w-full" className="px-4 bg-gray-50 dark:bg-gray-950">
        <p className="text-sm text-muted-foreground">Identifiant de compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper maxWidthClass="w-full" className="px-4 bg-gray-50 dark:bg-gray-950">
      <div className="space-y-4 pb-6">
        <header className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">Activite Reseau</h1>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Domaine operationnel
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {periodLabel} · activite consolidee du reseau depuis les journaux valides.
            </p>
          </div>
          <NetworkActivityPeriodBar
            preset={globalPeriod.preset}
            startDate={globalPeriod.startDate}
            endDate={globalPeriod.endDate}
            setPreset={globalPeriod.setPreset}
            setCustomRange={globalPeriod.setCustomRange}
          />
        </header>

        {!isOnline && <PageOfflineState message="Connexion instable : les donnees peuvent etre incompletes." />}
        {rangeError && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
            {rangeError} Les details operationnels sont limites sur cette periode.
          </div>
        )}
        {detailMode === "dailyStats" && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
            Periode agregee : les totaux et agences utilisent dailyStats. Les evenements recents et trajets restent disponibles sur les periodes courtes.
          </div>
        )}

        <section aria-label="Diagnostic operationnel" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {decisionCards.map((item) => (
            <DecisionSummaryCard key={item.label} item={item} />
          ))}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <Panel>
            <SectionTitle title="Analyse par canal" subtitle="Poids, evolution et decision par canal operationnel." />
            <div className="space-y-3">
              {channelRows.map((row) => {
                const pct = percent(row.amount, caTotal);
                const trend = deltaPct(row.amount, row.previousAmount);
                return (
                  <button
                    type="button"
                    key={row.label}
                    onClick={() => navigate(reservationsPath(canalFromLabel(row.label)))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-white">{row.label}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {compactNumber(row.volume)} transaction(s) · {row.detail}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-950 dark:text-white">{money(row.amount)}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{pct}% · {trendLabel(trend)}</p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white dark:bg-slate-900">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: row.color }} />
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Decision : {trend != null && trend < 0 ? row.decision : "Maintenir le suivi du canal sur la periode suivante."}
                    </p>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel>
            <SectionTitle
              title="Evolution du reseau"
              subtitle={`CA et places vendues. Tendance globale : ${trendLabel(globalTrend)} vs periode precedente.`}
            />
            {loading ? (
              <Skeleton className="h-[220px] rounded-xl" />
            ) : (
              <RevenueReservationsChart
                data={chartSeries.length > 0 ? chartSeries : emptyChart(startStr, endStr)}
                loading={loading}
                primaryColor={company?.couleurPrimaire}
                secondaryColor={company?.couleurSecondaire}
                range={startStr === endStr ? "day" : chartSeries.length <= 7 ? "week" : "month"}
                secondaryMetricLabel="Places"
              />
            )}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200">
              Decision : {globalTrend != null && globalTrend < 0 ? "identifier les agences, canaux et trajets qui expliquent la baisse." : "renforcer les zones qui tirent la croissance."}
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
          <Panel>
            <SectionTitle title="Performance agences" subtitle="Classement, tendance, canal dominant et decision par agence." />
            {loading ? (
              <Skeleton className="h-[220px] rounded-xl" />
            ) : agencyRows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucune agence classee sur la periode.</p>
            ) : (
              <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                        <th className="w-16 whitespace-nowrap py-2 pr-4">Rang</th>
                        <th className="min-w-[180px] whitespace-nowrap py-2 pr-4">Agence</th>
                        <th className="w-32 whitespace-nowrap py-2 pr-4 text-right">CA</th>
                        <th className="w-24 whitespace-nowrap py-2 pr-4 text-right">Billets</th>
                        <th className="w-36 whitespace-nowrap py-2 pr-4">Canal dominant</th>
                        <th className="w-28 whitespace-nowrap py-2 pr-4">Evolution</th>
                        <th className="w-32 whitespace-nowrap py-2">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agencyRows.map((agency, index) => {
                        const isSelected = selectedAgencyDetail?.agencyId === agency.agencyId;
                        return (
                          <tr
                            key={agency.agencyId}
                            onClick={() => setSelectedAgencyDetailId(agency.agencyId)}
                            className={cn(
                              "cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50",
                              isSelected && "bg-blue-50/70 dark:bg-blue-950/20"
                            )}
                          >
                            <td className="whitespace-nowrap py-3 pr-4 font-bold text-slate-500">#{index + 1}</td>
                            <td className="py-3 pr-4">
                              <p className="max-w-[260px] truncate font-semibold text-slate-950 dark:text-white">{agency.name}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {compactNumber(agency.transactions)} transaction(s)
                              </p>
                            </td>
                            <td className="whitespace-nowrap py-3 pr-4 text-right font-semibold tabular-nums">{money(agency.ventes)}</td>
                            <td className="whitespace-nowrap py-3 pr-4 text-right">{compactNumber(agency.billets)}</td>
                            <td className="whitespace-nowrap py-3 pr-4 font-medium">{agency.dominantChannel}</td>
                            <td className="whitespace-nowrap py-3 pr-4">
                              <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", trendClass(agency.evolutionPct))}>
                                {trendIcon(agency.evolutionPct)}
                                {trendLabel(agency.evolutionPct)}
                              </span>
                            </td>
                            <td className="whitespace-nowrap py-3">
                              <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold", statusClass(agency.status))}>
                                {statusLabel(agency.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  {selectedAgencyDetail ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Detail agence
                        </p>
                        <h3 className="mt-1 break-words text-base font-bold text-slate-950 dark:text-white">
                          {selectedAgencyDetail.name}
                        </h3>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Courrier</p>
                          <p className="mt-1 font-bold text-slate-950 dark:text-white">{compactNumber(selectedAgencyDetail.colis)}</p>
                        </div>
                        <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                          <p className="text-xs text-slate-500 dark:text-slate-400">Transactions</p>
                          <p className="mt-1 font-bold text-slate-950 dark:text-white">{compactNumber(selectedAgencyDetail.transactions)}</p>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Meilleur trajet</p>
                          <p className="mt-1 break-words font-semibold text-slate-800 dark:text-slate-100">{selectedAgencyDetail.bestRoute}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Decision</p>
                          <p className="mt-1 break-words text-slate-700 dark:text-slate-200">{selectedAgencyDetail.decision}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Recommandation</p>
                          <p className="mt-1 break-words text-slate-700 dark:text-slate-200">
                            {selectedAgencyDetail.status === "support"
                              ? "Analyser le canal dominant et ouvrir la fiche agence."
                              : selectedAgencyDetail.status === "excellent"
                                ? "Identifier les pratiques a reproduire dans le reseau."
                                : "Maintenir le suivi sur la prochaine periode."}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate(agencyPerformancePath(selectedAgencyDetail.agencyId))}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                      >
                        Ouvrir la fiche agence
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Selectionnez une agence pour afficher les details.
                    </p>
                  )}
                </aside>
              </div>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Chronologie reseau" subtitle="Evenements confirmes, du plus recent au plus ancien." />
            {loading ? (
              <Skeleton className="h-[220px] rounded-xl" />
            ) : detailMode !== "logs" ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Disponible uniquement sur les periodes courtes lues depuis activityLogs.</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucun evenement recent sur la periode.</p>
            ) : (
              <ul className="space-y-2">
                {recentActivity.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => navigate(reservationsPath(item.tone === "online" ? "digital" : item.tone === "courier" ? "courrier" : "guichet"))}
                    className="flex cursor-pointer flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition hover:bg-white dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950 dark:text-white break-words">{item.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{item.agencyName} · {item.timeLabel}</p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-slate-950 dark:text-white">{money(item.amount)}</p>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-200">
              Decision : investiguer les evenements anormaux depuis le module detaille.
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
          <Panel>
            <SectionTitle title="Performance trajets" subtitle="Rentabilite, evolution, agences exploitantes et decision par trajet." />
            {loading ? (
              <Skeleton className="h-[200px] rounded-xl" />
            ) : detailMode !== "logs" ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Detail trajet indisponible sur dailyStats.</p>
            ) : routeDecisionRows.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">Aucun trajet actif sur la periode.</p>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                      <th className="py-2 pr-3">Trajet</th>
                      <th className="py-2 pr-3 text-right">CA</th>
                      <th className="py-2 pr-3 text-right">Billets</th>
                      <th className="py-2 pr-3 text-right">Colis</th>
                      <th className="py-2 pr-3">Remplissage</th>
                      <th className="py-2 pr-3">Evolution</th>
                      <th className="py-2 pr-3 text-right">Agences</th>
                      <th className="py-2 pr-3">Statut</th>
                      <th className="py-2">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routeDecisionRows.map((row) => (
                      <tr
                        key={row.trajet}
                        onClick={() => navigate(routePerformancePath(row.trajet))}
                        className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                      >
                        <td className="py-3 pr-3 font-semibold text-slate-950 dark:text-white">{row.trajet}</td>
                        <td className="py-3 pr-3 text-right font-semibold tabular-nums">{money(row.caActivite)}</td>
                        <td className="py-3 pr-3 text-right">{compactNumber(row.billets)}</td>
                        <td className="py-3 pr-3 text-right">{compactNumber(row.colis)}</td>
                        <td className="py-3 pr-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{row.fillRateLabel}</td>
                        <td className="py-3 pr-3">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold", trendClass(row.evolutionPct))}>
                            {trendIcon(row.evolutionPct)}
                            {trendLabel(row.evolutionPct)}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right">{compactNumber(row.agenciesCount)}</td>
                        <td className="py-3 pr-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              row.status === "performant"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"
                                : row.status === "support"
                                  ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100"
                                  : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                            )}
                          >
                            {row.status === "performant" ? "Tres rentable" : row.status === "support" ? "A corriger" : "Stable"}
                          </span>
                        </td>
                        <td className="py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">{row.decision}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {fillRate != null && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Remplissage reseau global : {fillRate}% ({compactNumber(billetsPlaces)} places / {compactNumber(totalNetworkCapacity)} capacite). Le remplissage par trajet n'est pas expose par l'agregat actuel.
              </p>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Centre de diagnostic" subtitle="Constat, cause, impact et decision attendue." />
            {attentionItems.length === 0 ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
                Aucun point d'attention operationnel. Decision : maintenir la strategie actuelle et surveiller la prochaine periode.
              </div>
            ) : (
              <ul className="space-y-2">
                {attentionItems.map((item) => (
                  <li
                    key={`${item.title}-${item.cause}`}
                    onClick={item.onClick}
                    className={cn(
                      "cursor-pointer rounded-xl border px-3 py-3 text-sm transition hover:shadow-sm",
                      item.tone === "red" && "border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-100",
                      item.tone === "orange" && "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100",
                      item.tone === "blue" && "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-100",
                      item.tone === "green" && "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0 space-y-1">
                        <p className="font-bold">{item.title}</p>
                        <p><span className="font-semibold">Cause :</span> {item.cause}</p>
                        <p><span className="font-semibold">Impact :</span> {item.impact}</p>
                        <p><span className="font-semibold">Decision :</span> {item.action}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>
      </div>
    </StandardLayoutWrapper>
  );
}
