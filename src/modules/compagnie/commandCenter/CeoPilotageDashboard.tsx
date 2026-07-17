/**
 * Dashboard CEO — lecture stratégique sans recalcul métier.
 * Sources : getUnifiedCommercialActivity, getUnifiedCompanyFinance,
 * getNetworkStatsChartData, getNetworkActivityByAgency.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { db } from "@/firebaseConfig";
import { useCurrency, useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { useAuth } from "@/contexts/AuthContext";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";
import {
  getTodayBamako,
  TZ_BAMAKO,
  getStartOfDayInBamako,
  getEndOfDayInBamako,
} from "@/shared/date/dateUtilsTz";
import {
  aggregateActivityLogDocs,
  debugCommercialActivityPipeline,
  getUnifiedCommercialActivity,
  shouldPreferActivityLogsOverDailyStats,
  shouldUseDailyStatsForActivity,
  summarizeActivityLogDocs,
  summarizeCommercialActivity,
} from "@/modules/compagnie/networkStats/activityCore";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import { RevenueMiniChart } from "@/modules/agence/dashboard/components";
import {
  buildNetworkChartDataFromActivityLogDocs,
  getNetworkStatsChartData,
} from "@/modules/compagnie/networkStats/networkStatsService";
import {
  aggregateNetworkActivityByAgencyFromDocs,
  getNetworkActivityByAgency,
  type AgencyActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import type { PeriodKind } from "@/shared/date/periodUtils";
import { getInclusiveRangeDays, isInteractiveRangeTooLarge, largeRangeMessage } from "@/shared/date/periodUtils";
import {
  ArrowRight,
  Building2,
  CreditCard,
  Eye,
  EyeOff,
  Landmark,
  Minus,
  Package,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveLiquidCompanyColors } from "@/modules/compagnie/finances/financesLiquidityCardStyles";

dayjs.extend(utc);
dayjs.extend(timezone);

type Props = {
  companyId: string;
  periodStartStr: string;
  periodEndStr: string;
  periodKind: PeriodKind;
};

type GapLevel = "ok" | "warn" | "bad";
type AlertSeverity = "warn" | "bad";

type AlertItem = { message: string; severity: AlertSeverity; action?: string };
type CommercialActivity = Awaited<ReturnType<typeof getUnifiedCommercialActivity>>;
type CompanyFinance = Awaited<ReturnType<typeof getUnifiedCompanyFinance>>;
type NetworkActivityBundle = {
  activity: CommercialActivity;
  chartData: Awaited<ReturnType<typeof getNetworkStatsChartData>>;
  rows: AgencyActivityRow[];
  unavailable?: boolean;
};

/** Inchangé : utilisé uniquement pour les alertes intelligentes (seuils relatifs). */
function gapLevel(activity: number, encaissement: number): { gap: number; level: GapLevel } {
  const gap = activity - encaissement;
  const base = Math.max(activity, encaissement, 1);
  const rel = Math.abs(gap) / base;
  if (rel <= 0.1) return { gap, level: "ok" };
  if (rel <= 0.25) return { gap, level: "warn" };
  return { gap, level: "bad" };
}

/** Rapprochement activité / encaissements sur la période affichée — jamais CRITIQUE si écart négatif. */
function interpretPeriodActivityEncaissementEcart(activityTotal: number, encaissementsTotal: number) {
  const ecart = Math.round((activityTotal - encaissementsTotal) * 100) / 100;
  if (ecart > 0) {
    return {
      ecart,
      status: "critical" as const,
      statutLabel: "CRITIQUE",
      message: "Une partie de l'activité affichée n'est pas encore encaissée",
      action: "Vérifier les agences avec retard d'encaissement",
    };
  }
  if (ecart === 0) {
    return {
      ecart,
      status: "ok" as const,
      statutLabel: "OK",
      message: "Les encaissements correspondent à l'activité sur la période",
      action: null as string | null,
    };
  }
  return {
    ecart,
    status: "info" as const,
    statutLabel: "INFO",
    message: "Encaissements supérieurs à l'activité (décalage probable)",
    action: "Vérifier les saisies ou décalages Mobile Money",
  };
}

function alertRowClass(sev: AlertSeverity): string {
  if (sev === "bad") {
    return "border-red-300/90 bg-red-50/90 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100";
  }
  return "border-orange-300/90 bg-orange-50/90 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/35 dark:text-orange-100";
}

function trendPhrase(stable: boolean, delta: number): string {
  if (stable) return "stable";
  return delta >= 0 ? "en hausse" : "en baisse";
}

const DASH_CARD =
  "rounded-xl bg-white p-3 shadow-sm dark:bg-slate-900 sm:p-4";

type AgencyNamedRow = AgencyActivityRow & { nom: string };

function compactCount(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(Number(value) || 0));
}

function formatTrend(value: number | null): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.1) return "stable";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function trendTone(value: number | null, inverse = false): "neutral" | "success" | "warning" {
  if (value == null || !Number.isFinite(value) || Math.abs(value) < 0.1) return "neutral";
  const positive = value > 0;
  if (inverse) return positive ? "warning" : "success";
  return positive ? "success" : "warning";
}

function deltaPct(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function emptyCommercialActivity(): CommercialActivity {
  return {
    billets: {
      guichet: { reservationCount: 0, tickets: 0, amount: 0 },
      online: { reservationCount: 0, tickets: 0, amount: 0 },
      reservationCount: 0,
      tickets: 0,
      amount: 0,
    },
    courier: { parcels: 0, amount: 0 },
    totalAmount: 0,
  };
}

function emptyCompanyFinance(): CompanyFinance {
  return {
    realMoney: { cash: 0, mobileMoney: 0, bank: 0, total: 0 },
    activity: {
      sales: { reservationCount: 0, tickets: 0, amountHint: 0 },
      encaissements: { total: 0 },
      deposits: { total: 0 },
      expenses: { total: 0 },
      financialGap: 0,
      caNet: 0,
      split: { paiementsEnLigne: 0, paiementsGuichet: 0 },
    },
  };
}

function isPermissionDeniedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === "permission-denied";
}

function warnIfUnexpectedReadError(message: string, error: unknown, context?: Record<string, string>): void {
  if (isPermissionDeniedError(error)) return;
  if (context) {
    console.warn(message, { ...context, error });
    return;
  }
  console.warn(message, error);
}

function activityBundleScore(bundle: NetworkActivityBundle): number {
  const rowTotal = bundle.rows.reduce(
    (sum, row) => sum + (Number(row.ventes) || 0) + (Number(row.billets) || 0) + (Number(row.colis) || 0),
    0
  );
  const chartTotal = bundle.chartData.reduce(
    (sum, point) => sum + (Number(point.revenue) || 0) + (Number(point.reservations) || 0),
    0
  );
  return (
    (Number(bundle.activity.totalAmount) || 0) +
    (Number(bundle.activity.billets.tickets) || 0) +
    (Number(bundle.activity.courier.parcels) || 0) +
    rowTotal +
    chartTotal
  );
}

function formatMiniTrendAxisLabel(rawDate: string, index: number, total: number, periodKind: PeriodKind): string {
  const value = String(rawDate || "");
  if (periodKind === "day" || value.includes("T")) {
    const hour = value.includes("T") ? value.slice(11, 13) : "";
    if (["00", "06", "12", "18", "23"].includes(hour)) return `${hour}h`;
    return "";
  }
  const parsed = dayjs(value.slice(0, 10));
  if (!parsed.isValid()) return "";
  if (periodKind === "month" || total > 10) {
    const day = parsed.date();
    const isLast = index === total - 1;
    if (day === 1 || day === 8 || day === 15 || day === 22 || isLast) return parsed.format("DD/MM");
    return "";
  }
  return parsed.format("DD/MM");
}

function ExecutiveCard({
  to,
  icon,
  label,
  value,
  detail,
  tooltipDetail,
  trend,
  tone = "neutral",
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail: string;
  tooltipDetail?: string;
  trend?: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50/80 text-red-950 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-100"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"
          : "border-slate-200 bg-white text-slate-950 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-50";

  return (
    <Link
      to={to}
      title={tooltipDetail ?? detail}
      className={cn(
        "group flex min-w-0 flex-col rounded-xl border px-3 py-2.5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40",
        toneClass
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/70 text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-100">
          {icon}
          </span>
          <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
        </div>
        {trend ? <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold leading-4 opacity-80 dark:bg-slate-950/35">{trend}</span> : null}
      </div>
      <div className="mt-1.5 min-w-0 whitespace-nowrap text-[15px] font-bold leading-tight tabular-nums text-current sm:text-base">
        {value}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] font-semibold leading-4 opacity-70">
        <span className="truncate">{detail}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-90" />
      </div>
    </Link>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2 flex flex-col gap-0.5">
      <h2 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function CompactMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/25 dark:text-red-100"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"
          : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-100";

  return (
    <div className={cn("rounded-xl border px-3 py-2", toneClass)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-base font-bold tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 text-[11px] opacity-70">{detail}</p> : null}
    </div>
  );
}

function DistributionBar({
  items,
}: {
  items: Array<{ label: string; value: number; color: string; detail: string }>;
}) {
  const total = Math.max(items.reduce((sum, item) => sum + Math.max(0, item.value), 0), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const pct = Math.round((Math.max(0, item.value) / total) * 100);
        return (
          <div key={item.label} className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200">{item.label}</span>
              <span className="shrink-0 whitespace-nowrap font-bold tabular-nums text-slate-900 dark:text-white">{item.detail}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white dark:bg-slate-900">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: item.color }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                {pct}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgencyStatusBadge({ status }: { status: "excellent" | "normal" | "watch" }) {
  const cls =
    status === "excellent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"
      : status === "watch"
        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-100"
        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300";
  const label = status === "excellent" ? "Excellent" : status === "watch" ? "À surveiller" : "Normal";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", cls)}>{label}</span>;
}

export default function CeoPilotageDashboard({
  companyId,
  periodStartStr,
  periodEndStr,
  periodKind,
}: Props) {
  const money = useFormatCurrency();
  const { currency } = useCurrency();
  const { company } = useAuth();
  const { primary: themePrimary } = useMemo(
    () => resolveLiquidCompanyColors(company ?? undefined),
    [company]
  );

  const [hideTreasury, setHideTreasury] = useState(false);
  const [loading, setLoading] = useState(true);

  const [ledger, setLedger] = useState<{
    total: number;
    cash: number;
    mobileMoney: number;
    bank: number;
  } | null>(null);
  const [commercialActivity, setCommercialActivity] = useState<CommercialActivity | null>(null);
  const [previousCommercialActivity, setPreviousCommercialActivity] = useState<CommercialActivity | null>(null);
  const [commercialActivityUnavailable, setCommercialActivityUnavailable] = useState(false);
  const [financeSnapshot, setFinanceSnapshot] = useState<CompanyFinance | null>(null);
  const [previousFinanceSnapshot, setPreviousFinanceSnapshot] = useState<CompanyFinance | null>(null);
  const [financeUnavailable, setFinanceUnavailable] = useState(false);
  const [todayActivity, setTodayActivity] = useState<number | null>(null);
  const [yesterdayActivity, setYesterdayActivity] = useState<number | null>(null);
  const [yesterdayEnc, setYesterdayEnc] = useState<number | null>(null);

  const [chartPoints, setChartPoints] = useState<Awaited<ReturnType<typeof getNetworkStatsChartData>>>([]);
  const [agenciesMeta, setAgenciesMeta] = useState<{ id: string; nom: string }[]>([]);
  const [agencyTodayRows, setAgencyTodayRows] = useState<AgencyActivityRow[]>([]);
  const [agencyTrendRows, setAgencyTrendRows] = useState<AgencyActivityRow[]>([]);
  const [agencyPrevRows, setAgencyPrevRows] = useState<AgencyActivityRow[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [rangeError, setRangeError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const todayCal = getTodayBamako();
        const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
        let rangeStart = isYmd(periodStartStr) ? periodStartStr : todayCal;
        let rangeEnd = isYmd(periodEndStr) ? periodEndStr : rangeStart;
        let rangeStartDj = dayjs.tz(`${rangeStart}T12:00:00`, TZ_BAMAKO);
        let rangeEndDj = dayjs.tz(`${rangeEnd}T12:00:00`, TZ_BAMAKO);
        if (rangeStartDj.isAfter(rangeEndDj)) {
          const t = rangeStart;
          rangeStart = rangeEnd;
          rangeEnd = t;
          rangeStartDj = dayjs.tz(`${rangeStart}T12:00:00`, TZ_BAMAKO);
          rangeEndDj = dayjs.tz(`${rangeEnd}T12:00:00`, TZ_BAMAKO);
        }
        if (isInteractiveRangeTooLarge(rangeStartDj.toDate(), rangeEndDj.toDate())) {
          setRangeError(largeRangeMessage());
          setLedger(null);
          setCommercialActivity(null);
          setPreviousCommercialActivity(null);
          setCommercialActivityUnavailable(false);
          setFinanceSnapshot(null);
          setPreviousFinanceSnapshot(null);
          setFinanceUnavailable(false);
          setTodayActivity(null);
          setYesterdayActivity(null);
          setYesterdayEnc(null);
          setChartPoints([]);
          setAgencyTodayRows([]);
          setAgencyTrendRows([]);
          setAgencyPrevRows([]);
          setAlerts([]);
          return;
        }
        setRangeError(null);
        setCommercialActivityUnavailable(false);
        setFinanceUnavailable(false);

        const periodLenDays = rangeEndDj.diff(rangeStartDj, "day") + 1;
        const prevPeriodEndDj = rangeStartDj.subtract(1, "day");
        const prevPeriodStartDj = prevPeriodEndDj.subtract(periodLenDays - 1, "day");
        const prevPeriodStart = prevPeriodStartDj.format("YYYY-MM-DD");
        const prevPeriodEnd = prevPeriodEndDj.format("YYYY-MM-DD");

        const dayBeforeEnd = rangeEndDj.subtract(1, "day").format("YYYY-MM-DD");
        const dayBefore2End = rangeEndDj.subtract(2, "day").format("YYYY-MM-DD");

        const meta = await getDocs(collection(db, "companies", companyId, "agences"))
          .then((agSnap) =>
            agSnap.docs.map((d) => {
              const data = d.data() as { nom?: string; nomAgence?: string };
              return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
            })
          )
          .catch((error) => {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Agencies metadata unavailable", error);
            return [] as { id: string; nom: string }[];
          });
        if (cancelled) return;

        const loadActivityFromNetworkSource = async (dateFrom: string, dateTo: string): Promise<NetworkActivityBundle> => {
          const start = getStartOfDayInBamako(dateFrom);
          const end = getEndOfDayInBamako(dateTo);
          const canUseActivityLogsFallback = getInclusiveRangeDays(start, end) <= 31;

          const loadActivityLogsBundle = async (): Promise<NetworkActivityBundle | null> => {
            try {
              const docs = await queryActivityLogsInRange(companyId, start, end);
              const activity = aggregateActivityLogDocs(docs);
              debugCommercialActivityPipeline("CeoPilotageDashboard.activityLogsBundle", {
                companyId,
                period: { dateFrom, dateTo },
                sourceRetenue: "activityLogs",
                activityLogs: summarizeActivityLogDocs(docs),
                final: summarizeCommercialActivity(activity),
              });
              return {
                activity,
                chartData: buildNetworkChartDataFromActivityLogDocs(docs, dateFrom, dateTo, TZ_BAMAKO),
                rows: aggregateNetworkActivityByAgencyFromDocs(docs, meta),
              };
            } catch (error) {
              warnIfUnexpectedReadError("[CeoPilotageDashboard] Activity logs fallback unavailable", error, {
                dateFrom,
                dateTo,
              });
              return null;
            }
          };

          try {
            if (shouldUseDailyStatsForActivity(start, end)) {
              const [activity, chartData, rows] = await Promise.all([
                getUnifiedCommercialActivity(companyId, { dateFrom, dateTo }, { timeZone: TZ_BAMAKO }),
                getNetworkStatsChartData(companyId, dateFrom, dateTo).catch((error) => {
                  warnIfUnexpectedReadError("[CeoPilotageDashboard] Network chart unavailable", error);
                  return [] as Awaited<ReturnType<typeof getNetworkStatsChartData>>;
                }),
                getNetworkActivityByAgency(companyId, start, end, meta).catch((error) => {
                  warnIfUnexpectedReadError("[CeoPilotageDashboard] Agency activity unavailable", error);
                  return [] as AgencyActivityRow[];
                }),
              ]);
              const dailyStatsBundle = { activity, chartData, rows };
              if (canUseActivityLogsFallback) {
                const logsBundle = await loadActivityLogsBundle();
                if (
                  logsBundle &&
                  (shouldPreferActivityLogsOverDailyStats(dailyStatsBundle.activity, logsBundle.activity) ||
                    activityBundleScore(logsBundle) > activityBundleScore(dailyStatsBundle))
                ) {
                  debugCommercialActivityPipeline("CeoPilotageDashboard.sourceSelected", {
                    companyId,
                    period: { dateFrom, dateTo },
                    sourceRetenue: "activityLogs",
                    final: summarizeCommercialActivity(logsBundle.activity),
                    rows: logsBundle.rows,
                  });
                  return logsBundle;
                }
              }
              debugCommercialActivityPipeline("CeoPilotageDashboard.sourceSelected", {
                companyId,
                period: { dateFrom, dateTo },
                sourceRetenue: "dailyStats",
                final: summarizeCommercialActivity(dailyStatsBundle.activity),
                rows: dailyStatsBundle.rows,
              });
              return dailyStatsBundle;
            }

            const logsBundle = await loadActivityLogsBundle();
            if (logsBundle) return logsBundle;
          } catch (error) {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Commercial activity unavailable", error, { dateFrom, dateTo });
            if (canUseActivityLogsFallback) {
              const logsBundle = await loadActivityLogsBundle();
              if (logsBundle) return logsBundle;
            }
            return {
              activity: emptyCommercialActivity(),
              chartData: [],
              rows: meta.map((agency) => ({
                agencyId: agency.id,
                ventes: 0,
                billets: 0,
                placesGuichet: 0,
                placesOnline: 0,
                colis: 0,
              })),
              unavailable: true,
            };
          }
          return {
            activity: emptyCommercialActivity(),
            chartData: [],
            rows: meta.map((agency) => ({
              agencyId: agency.id,
              ventes: 0,
              billets: 0,
              placesGuichet: 0,
              placesOnline: 0,
              colis: 0,
            })),
            unavailable: true,
          };
        };

        let financeReadUnavailable = false;
        const [
          periodActivityBundle,
          finPeriodRes,
          finLedgerEnd,
          prevActivityBundle,
          finPrevPeriod,
          actDayBeforeEnd,
          actDayBefore2End,
        ] = await Promise.all([
          loadActivityFromNetworkSource(rangeStart, rangeEnd),
          getUnifiedCompanyFinance(companyId, rangeStart, rangeEnd).catch((error) => {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Finance period unavailable", error, {
              dateFrom: rangeStart,
              dateTo: rangeEnd,
            });
            financeReadUnavailable = true;
            return emptyCompanyFinance();
          }),
          getUnifiedCompanyFinance(companyId, rangeEnd, rangeEnd).catch((error) => {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Finance ledger unavailable", error, {
              dateFrom: rangeEnd,
              dateTo: rangeEnd,
            });
            financeReadUnavailable = true;
            return emptyCompanyFinance();
          }),
          loadActivityFromNetworkSource(prevPeriodStart, prevPeriodEnd),
          getUnifiedCompanyFinance(companyId, prevPeriodStart, prevPeriodEnd).catch((error) => {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Previous finance period unavailable", error, {
              dateFrom: prevPeriodStart,
              dateTo: prevPeriodEnd,
            });
            financeReadUnavailable = true;
            return emptyCompanyFinance();
          }),
          getUnifiedCommercialActivity(
            companyId,
            { dateFrom: dayBeforeEnd, dateTo: dayBeforeEnd },
            { timeZone: TZ_BAMAKO }
          ).catch((error) => {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Previous day activity unavailable", error, { date: dayBeforeEnd });
            return emptyCommercialActivity();
          }),
          getUnifiedCommercialActivity(
            companyId,
            { dateFrom: dayBefore2End, dateTo: dayBefore2End },
            { timeZone: TZ_BAMAKO }
          ).catch((error) => {
            warnIfUnexpectedReadError("[CeoPilotageDashboard] Two days before activity unavailable", error, { date: dayBefore2End });
            return emptyCommercialActivity();
          }),
        ]);
        if (cancelled) return;

        const actPeriodRes = periodActivityBundle.activity;
        const actPrevPeriod = prevActivityBundle.activity;
        const chart = periodActivityBundle.chartData;
        const rowsPeriod = periodActivityBundle.rows;
        const rowsPrevPeriod = prevActivityBundle.rows;

        setLedger(finLedgerEnd.realMoney);
        setCommercialActivity(actPeriodRes);
        setPreviousCommercialActivity(actPrevPeriod);
        setCommercialActivityUnavailable(Boolean(periodActivityBundle.unavailable));
        setFinanceSnapshot(finPeriodRes);
        setPreviousFinanceSnapshot(finPrevPeriod);
        setFinanceUnavailable(financeReadUnavailable);
        setTodayActivity(actPeriodRes.totalAmount);
        setYesterdayActivity(actPeriodRes.totalAmount);
        setYesterdayEnc(finPeriodRes.activity.encaissements.total);
        setChartPoints(chart);
        setAgenciesMeta(meta);
        setAgencyTodayRows(rowsPeriod);
        setAgencyTrendRows(rowsPeriod);
        setAgencyPrevRows(rowsPrevPeriod);
        debugCommercialActivityPipeline("CeoPilotageDashboard.finalToUI", {
          companyId,
          period: { dateFrom: periodStartStr, dateTo: periodEndStr },
          resultFinalDashboardCEO: summarizeCommercialActivity(actPeriodRes),
          chartPoints: chart.length,
          agencyRows: rowsPeriod,
        });

        const alertBag: AlertItem[] = [];

        const encY = finPeriodRes.activity.encaissements.total;
        const actY = actPeriodRes.totalAmount;
        const gapY = actY - encY;
        const gY = gapLevel(actY, encY);
        if (gY.level !== "ok" && gapY > 0 && actY >= 10_000) {
          alertBag.push({
            severity: gY.level === "bad" ? "bad" : "warn",
            message: `Période affichée : ${formatCurrency(gapY, currency)} d'activité pas encore en caisse.`,
            action: "Vérifier les agences avec retard d'encaissement",
          });
        }

        const dates7 = Array.from({ length: 7 }).map((_, i) => rangeEndDj.subtract(i, "day").format("YYYY-MM-DD"));
        const dayChecks = await Promise.all(
          dates7.map(async (date) => {
            try {
              const [a, f] = await Promise.all([
                getUnifiedCommercialActivity(companyId, { dateFrom: date, dateTo: date }, { timeZone: TZ_BAMAKO }),
                getUnifiedCompanyFinance(companyId, date, date),
              ]);
              const act = a.totalAmount;
              const enc = f.activity.encaissements.total;
              const base = Math.max(act, enc, 1);
              return act >= 20_000 && Math.abs(act - enc) / base > 0.15;
            } catch (error) {
              warnIfUnexpectedReadError("[CeoPilotageDashboard] Daily anomaly check unavailable", error, { date });
              return false;
            }
          })
        );
        const anomalyDays = dayChecks.filter(Boolean).length;
        if (anomalyDays >= 3) {
          alertBag.push({
            severity: "bad",
            message: `Écart activité / caisse sur ${anomalyDays} jours (fenêtre jusqu'au ${rangeEnd}).`,
            action: "Croiser ventes et encaissements jour par jour",
          });
        }

        const byPrev = new Map(rowsPrevPeriod.map((r) => [r.agencyId, r]));
        const dropAgencies = rowsPeriod
          .map((cur) => {
            const prev = byPrev.get(cur.agencyId);
            const prevV = prev?.ventes ?? 0;
            if (prevV < 20_000) return null;
            const ratio = cur.ventes / prevV;
            if (ratio <= 0.6) {
              return {
                name: meta.find((a) => a.id === cur.agencyId)?.nom ?? cur.agencyId,
                ratio,
              };
            }
            return null;
          })
          .filter(Boolean) as Array<{ name: string; ratio: number }>;
        if (dropAgencies.length > 0) {
          const worst = dropAgencies.sort((a, b) => a.ratio - b.ratio)[0];
          alertBag.push({
            severity: "warn",
            message: `${worst.name} : forte baisse vs la période précédente de même durée.`,
            action: "Identifier les agences en baisse",
          });
        }

        const periodTotal = rowsPeriod.reduce((s, r) => s + (Number(r.ventes) || 0), 0);
        if (periodTotal > 0) {
          const top = [...rowsPeriod].sort((a, b) => b.ventes - a.ventes)[0];
          if (top) {
            const share = top.ventes / periodTotal;
            if (share > 0.7) {
              const topName = meta.find((a) => a.id === top.agencyId)?.nom ?? top.agencyId;
              alertBag.push({
                severity: "warn",
                message: `${Math.round(share * 100)} % de l'activité sur ${topName} sur la période affichée.`,
                action: "Répartir les ventes sur plusieurs agences",
              });
            }
          }
        }

        if (
          rangeStart === rangeEnd &&
          actDayBefore2End.totalAmount >= 30_000 &&
          actDayBeforeEnd.totalAmount < actDayBefore2End.totalAmount * 0.45
        ) {
          alertBag.push({
            severity: "bad",
            message: "Jour précédant la date affichée : activité très basse vs avant-veille.",
            action: "Identifier les agences en baisse",
          });
        }

        setAlerts(alertBag.slice(0, 3));
      } catch (e) {
        console.error("[CeoPilotageDashboard]", e);
        setLedger(null);
        setCommercialActivity(null);
        setPreviousCommercialActivity(null);
        setCommercialActivityUnavailable(false);
        setFinanceSnapshot(null);
        setPreviousFinanceSnapshot(null);
        setFinanceUnavailable(false);
        setTodayActivity(null);
        setYesterdayActivity(null);
        setYesterdayEnc(null);
        setChartPoints([]);
        setAgencyTodayRows([]);
        setAgencyTrendRows([]);
        setAgencyPrevRows([]);
        setAlerts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, periodStartStr, periodEndStr, currency]);

  const ecartHier = useMemo(() => {
    if (yesterdayActivity == null || yesterdayEnc == null) return null;
    return interpretPeriodActivityEncaissementEcart(yesterdayActivity, yesterdayEnc);
  }, [yesterdayActivity, yesterdayEnc]);

  const trendDayCount = useMemo(() => {
    if (!periodStartStr || !periodEndStr) return 1;
    const a = dayjs.tz(`${periodStartStr}T12:00:00`, TZ_BAMAKO);
    const b = dayjs.tz(`${periodEndStr}T12:00:00`, TZ_BAMAKO);
    return Math.max(1, b.diff(a, "day") + 1);
  }, [periodStartStr, periodEndStr]);

  const activeAgenciesCount = useMemo(
    () => agencyTodayRows.filter((r) => r.ventes > 0 || r.colis > 0).length,
    [agencyTodayRows]
  );
  const totalAgencies = agenciesMeta.length;

  const chartForDisplay = useMemo(
    () => chartPoints.map((p) => ({ date: p.date, revenue: p.revenue, reservations: p.reservations })),
    [chartPoints]
  );

  const trendVs7 = useMemo(() => {
    const pts = chartForDisplay.filter((p) => p.date && !String(p.date).includes("T"));
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1].revenue;
    const prev = pts.slice(0, -1);
    const avgPrev = prev.reduce((s, p) => s + p.revenue, 0) / prev.length;
    if (avgPrev <= 0) return null;
    const delta = ((last - avgPrev) / avgPrev) * 100;
    const rounded = Math.round(delta * 10) / 10;
    const stable = Math.abs(rounded) < 3;
    return {
      delta: rounded,
      stable,
      headline: stable ? "Stable" : rounded >= 0 ? "En croissance" : "En baisse",
    };
  }, [chartForDisplay]);

  const namedTrendRows: AgencyNamedRow[] = useMemo(
    () =>
      agencyTrendRows.map((r) => ({
        ...r,
        nom: agenciesMeta.find((a) => a.id === r.agencyId)?.nom ?? r.agencyId,
      })),
    [agencyTrendRows, agenciesMeta]
  );

  const topAgencies = useMemo(
    () =>
      namedTrendRows
        .filter((row) => (Number(row.ventes) || 0) > 0 || (Number(row.billets) || 0) > 0 || (Number(row.colis) || 0) > 0)
        .sort((a, b) => b.ventes - a.ventes)
        .slice(0, 3),
    [namedTrendRows]
  );
  const maskedMoney = (amount: number) => (hideTreasury ? "••••••" : money(amount));
  const basePath = `/compagnie/${companyId}`;
  const encaissements = financeSnapshot?.activity.encaissements.total ?? 0;
  const expenses = financeSnapshot?.activity.expenses.total ?? 0;
  const financialGap = financeSnapshot?.activity.financialGap ?? 0;
  const tickets = commercialActivity?.billets.tickets ?? 0;
  const parcels = commercialActivity?.courier.parcels ?? 0;
  const inactiveAgencies = Math.max(0, totalAgencies - activeAgenciesCount);
  const agenciesToWatch = useMemo(() => {
    return namedTrendRows
      .filter((row) => (Number(row.ventes) || 0) <= 0 && (Number(row.colis) || 0) <= 0)
      .slice(0, 3);
  }, [namedTrendRows]);
  const priorityAlerts = useMemo(() => alerts.slice(0, 3), [alerts]);
  const healthTone = inactiveAgencies > 0 || agenciesToWatch.length > 0 ? "warning" : "success";
  const financeTone = financeUnavailable ? "warning" : ecartHier?.status === "critical" || financialGap > 0 ? "warning" : "neutral";
  const networkRevenue = commercialActivity?.totalAmount ?? todayActivity ?? 0;
  const activityUnavailable = !loading && !rangeError && (!commercialActivity || commercialActivityUnavailable);
  const activityMoneyValue = activityUnavailable ? "Donnée indisponible" : money(networkRevenue);
  const activityCountValue = (value: number) => (activityUnavailable ? "Donnée indisponible" : compactCount(value));
  const guichetAmount = commercialActivity?.billets.guichet.amount ?? 0;
  const onlineAmount = commercialActivity?.billets.online.amount ?? 0;
  const courierAmount = commercialActivity?.courier.amount ?? 0;
  const guichetTickets = commercialActivity?.billets.guichet.tickets ?? 0;
  const onlineTickets = commercialActivity?.billets.online.tickets ?? 0;
  const netBalance = financeSnapshot?.activity.caNet ?? encaissements - expenses;
  const prevActiveAgenciesCount = useMemo(
    () => agencyPrevRows.filter((r) => r.ventes > 0 || r.colis > 0).length,
    [agencyPrevRows]
  );
  const networkTrend = deltaPct(networkRevenue, previousCommercialActivity?.totalAmount ?? 0);
  const ticketsTrend = deltaPct(tickets, previousCommercialActivity?.billets.tickets ?? 0);
  const courierTrend = deltaPct(courierAmount, previousCommercialActivity?.courier.amount ?? 0);
  const encaissementsTrend = deltaPct(encaissements, previousFinanceSnapshot?.activity.encaissements.total ?? 0);
  const expensesTrend = deltaPct(expenses, previousFinanceSnapshot?.activity.expenses.total ?? 0);
  const agencyTrendLabel =
    prevActiveAgenciesCount > 0
      ? `${activeAgenciesCount - prevActiveAgenciesCount >= 0 ? "+" : ""}${activeAgenciesCount - prevActiveAgenciesCount} vs période précédente`
      : null;
  const attentionItems = [
    ...priorityAlerts.map((item, index) => ({
      id: `alert-${index}`,
      title: item.severity === "bad" ? "Signal critique" : "Signal à surveiller",
      detail: item.message,
      tone: item.severity,
    })),
    ...agenciesToWatch.map((agency) => ({
      id: `agency-${agency.agencyId}`,
      title: agency.nom,
      detail: "Aucune activité consolidée sur la période.",
      tone: "warn" as const,
    })),
  ].slice(0, 5);

  return (
    <div className="w-full space-y-4 pb-5" aria-live={loading ? "polite" : "off"} aria-busy={loading}>
      {rangeError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          {rangeError} Les détails de pilotage sont désactivés sur cette période.
        </div>
      )}

      <section aria-label="Vue exécutive" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <ExecutiveCard
          to={`${basePath}/reservations-reseau`}
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="CA réseau"
          value={loading ? "Chargement" : activityMoneyValue}
          detail={activityUnavailable ? "Indisponible" : "Voir le détail"}
          tooltipDetail={
            activityUnavailable
              ? "Source activité consolidée indisponible"
              : `Billets ${money(commercialActivity?.billets.amount ?? 0)} · Courrier ${money(courierAmount)}`
          }
          trend={formatTrend(networkTrend)}
          tone="success"
        />
        <ExecutiveCard
          to={`${basePath}/reservations-reseau`}
          icon={<CreditCard className="h-3.5 w-3.5" />}
          label="Billets"
          value={loading ? "Chargement" : activityCountValue(tickets)}
          detail={activityUnavailable ? "Indisponible" : "Voir le détail"}
          tooltipDetail={
            activityUnavailable
              ? "Source activité consolidée indisponible"
              : `Guichet ${compactCount(guichetTickets)} · En ligne ${compactCount(onlineTickets)}`
          }
          trend={formatTrend(ticketsTrend)}
          tone={trendTone(ticketsTrend)}
        />
        <ExecutiveCard
          to={`${basePath}/reservations-reseau`}
          icon={<Package className="h-3.5 w-3.5" />}
          label="Courrier"
          value={loading ? "Chargement" : activityCountValue(parcels)}
          detail={activityUnavailable ? "Indisponible" : "Voir le détail"}
          tooltipDetail={activityUnavailable ? "Source activité consolidée indisponible" : `CA courrier ${money(courierAmount)}`}
          trend={formatTrend(courierTrend)}
          tone={trendTone(courierTrend)}
        />
        <ExecutiveCard
          to={`${basePath}/finances`}
          icon={<Landmark className="h-3.5 w-3.5" />}
          label="Trésorerie"
          value={loading ? "Chargement" : maskedMoney(ledger?.total ?? 0)}
          detail="Voir le détail"
          tooltipDetail={`Caisse ${maskedMoney(ledger?.cash ?? 0)} · Banque ${maskedMoney(ledger?.bank ?? 0)} · Mobile ${maskedMoney(ledger?.mobileMoney ?? 0)}`}
          tone={financeTone}
        />
        <ExecutiveCard
          to={`${basePath}/performance-agence`}
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Agences"
          value={loading ? "Chargement" : `${activeAgenciesCount} / ${totalAgencies}`}
          detail="Voir le détail"
          tooltipDetail={inactiveAgencies > 0 ? `${inactiveAgencies} agence(s) sans activité` : "Toutes les agences visibles sont actives"}
          trend={agencyTrendLabel}
          tone={healthTone}
        />
        <ExecutiveCard
          to={`${basePath}/audit-controle`}
          icon={<ShieldAlert className="h-3.5 w-3.5" />}
          label="Alertes"
          value={loading ? "Chargement" : attentionItems.length}
          detail={attentionItems.length > 0 ? "Voir le détail" : "Situation normale"}
          tooltipDetail={attentionItems.length > 0 ? "Signaux à examiner" : "Situation normale"}
          tone={attentionItems.length > 0 ? "warning" : "success"}
        />
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.35fr_0.65fr]">
        <div className={cn(DASH_CARD, "border border-slate-200 dark:border-slate-800")}>
          <SectionHeading
            title="Performance réseau"
            subtitle="Canaux et tendance courte."
          />
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.95fr)_minmax(280px,1.05fr)]">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Répartition par canal
              </p>
              <DistributionBar
                items={[
                  { label: "Guichet", value: guichetAmount, color: "#059669", detail: money(guichetAmount) },
                  { label: "En ligne", value: onlineAmount, color: "#2563eb", detail: money(onlineAmount) },
                  { label: "Courrier", value: courierAmount, color: "#ea580c", detail: money(courierAmount) },
                ]}
              />
            </div>
            <div className="min-w-0">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mini-tendance
              </p>
              {chartForDisplay.length > 0 ? (
                <div className="min-w-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/50">
                  <RevenueMiniChart
                    data={chartForDisplay.map((point, index) => ({
                      label: formatMiniTrendAxisLabel(point.date, index, chartForDisplay.length, periodKind),
                      value: point.revenue,
                      color: themePrimary,
                    }))}
                    height={58}
                  />
                </div>
              ) : (
                <div className="flex min-h-[64px] items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  {loading ? "Chargement..." : "Aucune activité sur la période."}
                </div>
              )}
            </div>
          </div>
          {trendVs7 ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-900 dark:text-slate-100">
              <span>Lecture :</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  trendVs7.stable && "text-slate-700 dark:text-slate-200",
                  !trendVs7.stable && trendVs7.delta >= 0 && "text-emerald-700 dark:text-emerald-300",
                  !trendVs7.stable && trendVs7.delta < 0 && "text-orange-700 dark:text-orange-300"
                )}
              >
                {!trendVs7.stable && trendVs7.delta >= 0 ? (
                  <TrendingUp className="h-4 w-4 shrink-0" />
                ) : !trendVs7.stable && trendVs7.delta < 0 ? (
                  <TrendingDown className="h-4 w-4 shrink-0" />
                ) : (
                  <Minus className="h-4 w-4 shrink-0" />
                )}
                {trendPhrase(trendVs7.stable, trendVs7.delta)}
              </span>
              <span className="font-normal text-slate-500 dark:text-slate-400">
                ({trendVs7.delta}% vs moyenne des autres jours)
              </span>
            </p>
          ) : null}
        </div>

        <div className={cn(DASH_CARD, "border border-slate-200 dark:border-slate-800")}>
          <SectionHeading
            title="Points d'attention"
            subtitle="Signaux prioritaires."
          />
          {attentionItems.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100">
              Aucun point d'attention.
            </div>
          ) : (
            <ul className="space-y-2">
              {attentionItems.map((item) => (
                <li
                  key={item.id}
                  title={item.detail}
                  className={cn("flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs", alertRowClass(item.tone))}
                >
                  <p className="min-w-0 truncate font-semibold">{item.title}</p>
                  <span className="shrink-0 rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-semibold dark:bg-slate-950/30">
                    {item.tone === "bad" ? "Priorité" : "Suivi"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            to={`${basePath}/audit-controle`}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            Ouvrir les alertes
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-[0.9fr_1.1fr]">
        <div className={cn(DASH_CARD, "border border-slate-200 dark:border-slate-800")}>
          <div className="mb-2 flex items-start justify-between gap-3">
            <SectionHeading
              title="Santé financière"
              subtitle="Résumé consolidé."
            />
            <button
              type="button"
              onClick={() => setHideTreasury((v) => !v)}
              className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              title={hideTreasury ? "Afficher les montants" : "Masquer les montants"}
              aria-pressed={hideTreasury}
              aria-label={hideTreasury ? "Afficher les montants financiers" : "Masquer les montants financiers"}
            >
              {hideTreasury ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <CompactMetric label="Trésorerie disponible" value={loading ? "Chargement" : maskedMoney(ledger?.total ?? 0)} tone={financeTone} />
            <CompactMetric label="Solde net" value={loading ? "Chargement" : maskedMoney(netBalance)} />
            <CompactMetric label="Encaissements" value={loading ? "Chargement" : maskedMoney(encaissements)} detail={formatTrend(encaissementsTrend) ?? undefined} />
            <CompactMetric label="Dépenses" value={loading ? "Chargement" : maskedMoney(expenses)} detail={formatTrend(expensesTrend) ?? undefined} />
          </div>
        </div>

        <div className={cn(DASH_CARD, "border border-slate-200 dark:border-slate-800")}>
          <SectionHeading
            title="Top agences"
            subtitle={`Agences qui tirent le réseau sur ${trendDayCount} jour(s).`}
          />
          {topAgencies.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Aucune agence classée sur la période.</p>
          ) : (
            <div className="space-y-2">
              {topAgencies.map((agency, index) => {
                const prev = agencyPrevRows.find((row) => row.agencyId === agency.agencyId);
                const agencyDelta = deltaPct(agency.ventes, prev?.ventes ?? 0);
                const status =
                  agenciesToWatch.some((row) => row.agencyId === agency.agencyId)
                    ? "watch"
                    : index === 0 && agency.ventes > 0
                      ? "excellent"
                      : "normal";
                return (
                  <Link
                    key={agency.agencyId}
                    to={`${basePath}/performance-agence?agency=${encodeURIComponent(agency.agencyId)}`}
                    className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 transition hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800 sm:grid-cols-[auto_1fr_auto]"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-100">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{agency.nom}</p>
                        <AgencyStatusBadge status={status} />
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-sm font-bold tabular-nums text-slate-950 dark:text-white">{money(agency.ventes)}</p>
                      {formatTrend(agencyDelta) ? (
                        <p className={cn("text-xs font-semibold", trendTone(agencyDelta) === "success" ? "text-emerald-600" : "text-amber-600")}>
                          {formatTrend(agencyDelta)}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className={cn(DASH_CARD, "border border-slate-200 dark:border-slate-800")}>
        <SectionHeading
          title="Accès rapides"
          subtitle="Modules de détail."
        />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Activité réseau", `${basePath}/reservations-reseau`],
            ["Finances", `${basePath}/finances`],
            ["Agences", `${basePath}/agences`],
            ["Paramètres", `${basePath}/parametres`],
          ].map(([label, to]) => (
            <Link
              key={to}
              to={to}
              className="inline-flex min-h-[36px] items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <span className="truncate">{label}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
