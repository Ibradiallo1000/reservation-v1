/**
 * Dashboard CEO — lecture stratégique sans recalcul métier.
 * Sources : getUnifiedCommercialActivity, getUnifiedCompanyFinance,
 * getNetworkStatsChartData, getNetworkActivityByAgency.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { db } from "@/firebaseConfig";
import { useCurrency, useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";
import {
  getTodayBamako,
  TZ_BAMAKO,
  getStartOfDayInBamako,
  getEndOfDayInBamako,
} from "@/shared/date/dateUtilsTz";
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";
import { getUnifiedCommercialActivity } from "@/modules/compagnie/networkStats/activityCore";
import { getNetworkStatsChartData } from "@/modules/compagnie/networkStats/networkStatsService";
import {
  getNetworkActivityByAgency,
  type AgencyActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import type { PeriodKind } from "@/shared/date/periodUtils";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Landmark,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import InfoTooltip from "@/shared/ui/InfoTooltip";

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
type AlertConfidence = "low" | "medium" | "high";
type AlertUrgency = "immediate" | "today" | "watch";
type DataReliabilityLevel = "low" | "medium" | "high";

type AlertItem = {
  id: string;
  title: string;
  severity: AlertSeverity;
  cause: string;
  impact: string;
  action: string;
  confidence: AlertConfidence;
  urgency: AlertUrgency;
  actionLabel: string;
  actionRoute: string;
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

function interpretPeriodActivityEncaissementEcart(activityTotal: number, encaissementsTotal: number) {
  const ecart = Math.round((activityTotal - encaissementsTotal) * 100) / 100;
  if (ecart > 0) {
    return {
      ecart,
      status: "critical" as const,
      statutLabel: "CRITIQUE",
      message: "Activite non convertie en encaissement",
      action: "Analyser les retards d'encaissement",
    };
  }
  if (ecart === 0) {
    return {
      ecart,
      status: "ok" as const,
      statutLabel: "OK",
      message: "Encaissements alignes avec l'activite",
      action: null as string | null,
    };
  }
  return {
    ecart,
    status: "info" as const,
    statutLabel: "INFO",
    message: "Encaissements superieurs a l'activite (decalage probable)",
    action: "Verifier les ecritures et flux Mobile Money",
  };
}

function alertRowClass(sev: AlertSeverity, reliability: DataReliabilityLevel): string {
  if (reliability === "low") {
    return "border-slate-300 bg-slate-50/95 text-slate-900 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-100";
  }
  if (sev === "bad") {
    return "border-red-300/90 bg-red-50/90 text-red-950 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100";
  }
  return "border-orange-300/90 bg-orange-50/90 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/35 dark:text-orange-100";
}

function severityLabel(sev: AlertSeverity): string {
  if (sev === "bad") return "Critique";
  return "A traiter";
}

function trendPhrase(stable: boolean, delta: number): string {
  if (stable) return "stable";
  return delta >= 0 ? "en hausse" : "en baisse";
}

type KpiTone = "positive" | "neutral" | "negative";

function computeDeltaPercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) {
    if (current === 0) return 0;
    return current > 0 ? 100 : -100;
  }
  const delta = ((current - previous) / Math.abs(previous)) * 100;
  return Math.round(delta * 10) / 10;
}

function formatDeltaPercent(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return "n/a";
  if (delta === 0) return "0%";
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

function toneFromDelta(delta: number | null, options?: { stableBand?: number; reverse?: boolean }): KpiTone {
  const stableBand = options?.stableBand ?? 3;
  if (delta == null) return "neutral";
  if (Math.abs(delta) < stableBand) return "neutral";
  if (options?.reverse) return delta < 0 ? "positive" : "negative";
  return delta > 0 ? "positive" : "negative";
}

function toneBadgeClass(tone: KpiTone): string {
  if (tone === "positive") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200";
  }
  if (tone === "negative") {
    return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200";
  }
  return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
}

function toneLabel(tone: KpiTone): string {
  if (tone === "positive") return "positif";
  if (tone === "negative") return "alerte";
  return "neutre";
}

function deltaBadgeClass(delta: number | null): string {
  if (delta == null) {
    return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  }
  if (delta >= 0) {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200";
  }
  return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200";
}

/** Carte dashboard (style unique mobile / desktop). */
const DASH_CARD =
  "rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-5";

const sectionTitle = "text-base font-semibold tracking-tight text-gray-900 dark:text-white";

const kpiLabel = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

const kpiAmount =
  "text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50";

type AgencyNamedRow = AgencyActivityRow & { nom: string };

export default function CeoPilotageDashboard({
  companyId,
  periodStartStr,
  periodEndStr,
}: Props) {
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const { currency } = useCurrency();

  const [hideTreasury, setHideTreasury] = useState(false);
  const [loading, setLoading] = useState(true);

  const [ledger, setLedger] = useState<{
    total: number;
    cash: number;
    mobileMoney: number;
    bank: number;
  } | null>(null);
  const [todayActivity, setTodayActivity] = useState<number | null>(null);
  const [yesterdayActivity, setYesterdayActivity] = useState<number | null>(null);
  const [yesterdayEnc, setYesterdayEnc] = useState<number | null>(null);

  const [chartPoints, setChartPoints] = useState<Awaited<ReturnType<typeof getNetworkStatsChartData>>>([]);
  const [agenciesMeta, setAgenciesMeta] = useState<{ id: string; nom: string }[]>([]);
  const [agencyTodayRows, setAgencyTodayRows] = useState<AgencyActivityRow[]>([]);
  const [agencyTrendRows, setAgencyTrendRows] = useState<AgencyActivityRow[]>([]);
  const [agencyPrevRows, setAgencyPrevRows] = useState<AgencyActivityRow[]>([]);
  const [agencyYesterdayRows, setAgencyYesterdayRows] = useState<AgencyActivityRow[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [gapSheetOpen, setGapSheetOpen] = useState(false);

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

        const periodLenDays = rangeEndDj.diff(rangeStartDj, "day") + 1;
        const prevPeriodEndDj = rangeStartDj.subtract(1, "day");
        const prevPeriodStartDj = prevPeriodEndDj.subtract(periodLenDays - 1, "day");
        const prevPeriodStart = prevPeriodStartDj.format("YYYY-MM-DD");
        const prevPeriodEnd = prevPeriodEndDj.format("YYYY-MM-DD");

        const dayBeforeEnd = rangeEndDj.subtract(1, "day").format("YYYY-MM-DD");
        const dayBefore2End = rangeEndDj.subtract(2, "day").format("YYYY-MM-DD");

        const agSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        const meta = agSnap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string };
          return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
        });
        if (cancelled) return;

        const [
          actPeriodRes,
          finPeriodRes,
          finLedgerEnd,
          chart,
          rowsPeriod,
          rowsPrevPeriod,
          actDayBeforeEnd,
          actDayBefore2End,
          rowsEndDay,
        ] = await Promise.all([
          getUnifiedCommercialActivity(
            companyId,
            { dateFrom: rangeStart, dateTo: rangeEnd },
            { timeZone: TZ_BAMAKO }
          ),
          getUnifiedCompanyFinance(companyId, rangeStart, rangeEnd),
          getUnifiedCompanyFinance(companyId, rangeEnd, rangeEnd),
          getNetworkStatsChartData(companyId, rangeStart, rangeEnd),
          getNetworkActivityByAgency(
            companyId,
            getStartOfDayInBamako(rangeStart),
            getEndOfDayInBamako(rangeEnd),
            meta
          ),
          getNetworkActivityByAgency(
            companyId,
            getStartOfDayInBamako(prevPeriodStart),
            getEndOfDayInBamako(prevPeriodEnd),
            meta
          ),
          getUnifiedCommercialActivity(
            companyId,
            { dateFrom: dayBeforeEnd, dateTo: dayBeforeEnd },
            { timeZone: TZ_BAMAKO }
          ),
          getUnifiedCommercialActivity(
            companyId,
            { dateFrom: dayBefore2End, dateTo: dayBefore2End },
            { timeZone: TZ_BAMAKO }
          ),
          getNetworkActivityByAgency(
            companyId,
            getStartOfDayInBamako(rangeEnd),
            getEndOfDayInBamako(rangeEnd),
            meta
          ),
        ]);
        if (cancelled) return;

        setLedger(finLedgerEnd.realMoney);
        setTodayActivity(actPeriodRes.totalAmount);
        setYesterdayActivity(actPeriodRes.totalAmount);
        setYesterdayEnc(finPeriodRes.activity.encaissements.total);
        setChartPoints(chart);
        setAgenciesMeta(meta);
        setAgencyTodayRows(rowsPeriod);
        setAgencyTrendRows(rowsPeriod);
        setAgencyPrevRows(rowsPrevPeriod);
        setAgencyYesterdayRows(rowsEndDay);

        const routes = {
          finances: `/compagnie/${companyId}/finances?tab=liquidites`,
          network: `/compagnie/${companyId}/reservations-reseau`,
          audit: `/compagnie/${companyId}/audit-controle`,
        };

        const alertBag: AlertItem[] = [];

        const encY = finPeriodRes.activity.encaissements.total;
        const actY = actPeriodRes.totalAmount;
        const gapY = actY - encY;
        const gY = gapLevel(actY, encY);
        if (gY.level !== "ok" && gapY > 0 && actY >= 10_000) {
          alertBag.push({
            id: "period-gap",
            title: "Desalignement caisse vs activite",
            severity: gY.level === "bad" ? "bad" : "warn",
            cause: "Validations guichet et paiements en ligne en retard.",
            impact: `${formatCurrency(gapY, currency)} non visibles dans la tresorerie utile.`,
            action: "Traiter les validations en attente",
            confidence: gY.level === "bad" ? "high" : "medium",
            urgency: gY.level === "bad" ? "immediate" : "today",
            actionLabel: "Analyser la tresorerie",
            actionRoute: routes.finances,
          });
        }

        const dates7 = Array.from({ length: 7 }).map((_, i) => rangeEndDj.subtract(i, "day").format("YYYY-MM-DD"));
        const dayChecks = await Promise.all(
          dates7.map(async (date) => {
            const [a, f] = await Promise.all([
              getUnifiedCommercialActivity(companyId, { dateFrom: date, dateTo: date }, { timeZone: TZ_BAMAKO }),
              getUnifiedCompanyFinance(companyId, date, date),
            ]);
            const act = a.totalAmount;
            const enc = f.activity.encaissements.total;
            const base = Math.max(act, enc, 1);
            return act >= 20_000 && Math.abs(act - enc) / base > 0.15;
          })
        );
        const anomalyDays = dayChecks.filter(Boolean).length;
        if (anomalyDays >= 3) {
          alertBag.push({
            id: "multi-day-gap",
            title: "Ecarts repetes de rapprochement",
            severity: "bad",
            cause: `${anomalyDays} jours sur 7 au-dessus du seuil activity/caisse.`,
            impact: "Lecture de tresorerie instable pour arbitrer les depenses.",
            action: "Analyser les ecarts jour par jour",
            confidence: "high",
            urgency: "immediate",
            actionLabel: "Ouvrir Audit",
            actionRoute: routes.audit,
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
            id: "agency-drop",
            title: `Recul marque sur ${worst.name}`,
            severity: "warn",
            cause: "Sous-performance locale par rapport a la periode precedente.",
            impact: `${Math.round((1 - worst.ratio) * 100)}% de baisse estimee sur l'agence la plus en recul.`,
            action: "Identifier les agences en recul",
            confidence: "medium",
            urgency: "today",
            actionLabel: "Analyser le reseau",
            actionRoute: routes.network,
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
                id: "concentration",
                title: "Concentration de revenu",
                severity: "warn",
                cause: `${Math.round(share * 100)}% de l'activite concentree sur ${topName}.`,
                impact: "Risque de volatilite elevee si cette agence ralentit.",
                action: "Reequilibrer la contribution agences",
                confidence: "medium",
                urgency: "watch",
                actionLabel: "Analyser le reseau",
                actionRoute: routes.network,
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
            id: "day-drop",
            title: "Baisse journaliere brutale",
            severity: "bad",
            cause: "Baisse marquée du jour precedent par rapport a l'avant-veille.",
            impact: "Risque de perte de cadence commerciale sur le reseau actif.",
            action: "Identifier les agences en recul",
            confidence: "high",
            urgency: "immediate",
            actionLabel: "Analyser le reseau",
            actionRoute: routes.network,
          });
        }

        setAlerts(alertBag.slice(0, 3));
      } catch (e) {
        console.error("[CeoPilotageDashboard]", e);
        setLedger(null);
        setTodayActivity(null);
        setYesterdayActivity(null);
        setYesterdayEnc(null);
        setChartPoints([]);
        setAgencyTodayRows([]);
        setAgencyTrendRows([]);
        setAgencyPrevRows([]);
        setAgencyYesterdayRows([]);
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

  const pilotagePeriodLabelFr = useMemo(() => {
    const t = getTodayBamako();
    return formatActivityPeriodLabelFr(periodStartStr || t, periodEndStr || t, t);
  }, [periodStartStr, periodEndStr]);

  const singleDayPeriod = periodStartStr === periodEndStr;

  const periodCaption = useMemo(() => {
    const t = getTodayBamako();
    if (periodStartStr === t && periodEndStr === t) return "Aujourd'hui";
    return pilotagePeriodLabelFr;
  }, [periodStartStr, periodEndStr, pilotagePeriodLabelFr]);

  const top3YesterdayByActivity = useMemo(() => {
    const named = agencyYesterdayRows.map((r) => ({
      ...r,
      nom: agenciesMeta.find((a) => a.id === r.agencyId)?.nom ?? r.agencyId,
    }));
    return [...named].sort((a, b) => b.ventes - a.ventes).slice(0, 3);
  }, [agencyYesterdayRows, agenciesMeta]);

  useEffect(() => {
    if (!gapSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGapSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gapSheetOpen]);

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

  const periodSalesAmount = useMemo(
    () => agencyTodayRows.reduce((sum, row) => sum + (Number(row.ventes) || 0), 0),
    [agencyTodayRows]
  );
  const previousPeriodSalesAmount = useMemo(
    () => agencyPrevRows.reduce((sum, row) => sum + (Number(row.ventes) || 0), 0),
    [agencyPrevRows]
  );
  const periodBillets = useMemo(
    () => agencyTodayRows.reduce((sum, row) => sum + (Number(row.billets) || 0), 0),
    [agencyTodayRows]
  );
  const periodColis = useMemo(
    () => agencyTodayRows.reduce((sum, row) => sum + (Number(row.colis) || 0), 0),
    [agencyTodayRows]
  );
  const previousActiveAgenciesCount = useMemo(
    () => agencyPrevRows.filter((row) => row.ventes > 0 || row.colis > 0).length,
    [agencyPrevRows]
  );

  const salesDelta = useMemo(
    () => computeDeltaPercent(periodSalesAmount, previousPeriodSalesAmount),
    [periodSalesAmount, previousPeriodSalesAmount]
  );
  const activeAgenciesDelta = useMemo(
    () => computeDeltaPercent(activeAgenciesCount, previousActiveAgenciesCount),
    [activeAgenciesCount, previousActiveAgenciesCount]
  );

  const treasuryTone: KpiTone = useMemo(() => {
    if ((ledger?.total ?? 0) <= 0) return "negative";
    if (ecartHier?.status === "critical" || alerts.some((item) => item.severity === "bad")) return "negative";
    if (ecartHier?.status === "info" || alerts.length > 0) return "neutral";
    return "positive";
  }, [ledger?.total, ecartHier?.status, alerts]);

  const encaissementCoverageDelta = useMemo(() => {
    if (!todayActivity || todayActivity <= 0 || yesterdayEnc == null) return null;
    return Math.round((((yesterdayEnc / todayActivity) * 100) - 100) * 10) / 10;
  }, [todayActivity, yesterdayEnc]);

  const encaissementTone: KpiTone = useMemo(() => {
    if ((yesterdayEnc ?? 0) <= 0) return "negative";
    if ((todayActivity ?? 0) <= 0) return "negative";
    if (ecartHier?.status === "critical") return "negative";
    if (ecartHier?.status === "info") return "neutral";
    return "positive";
  }, [yesterdayEnc, todayActivity, ecartHier?.status]);

  const salesTone = useMemo(() => {
    if (periodSalesAmount <= 0) return "negative" as KpiTone;
    return toneFromDelta(salesDelta);
  }, [periodSalesAmount, salesDelta]);
  const sparklineBars = useMemo(() => {
    const source =
      chartForDisplay.length > 0
        ? chartForDisplay
        : [{ date: periodEndStr, revenue: periodSalesAmount, reservations: periodBillets }];
    const maxBars = 24;
    const sampled =
      source.length <= maxBars
        ? source
        : Array.from({ length: maxBars }, (_, i) => source[Math.floor((i * source.length) / maxBars)]);
    const maxRevenue = Math.max(...sampled.map((point) => point.revenue), 1);
    return sampled.map((point, index) => ({
      key: `${point.date}-${index}`,
      amount: point.revenue,
      height: Math.max(10, Math.round((point.revenue / maxRevenue) * 100)),
    }));
  }, [chartForDisplay, periodEndStr, periodSalesAmount, periodBillets]);

  const agencyPrevById = useMemo(
    () => new Map(agencyPrevRows.map((row) => [row.agencyId, row])),
    [agencyPrevRows]
  );
  const agencyComparisonRows = useMemo(() => {
    return [...namedTrendRows]
      .map((row) => {
        const currentSales = Number(row.ventes) || 0;
        const previousSales = Number(agencyPrevById.get(row.agencyId)?.ventes) || 0;
        const deltaSales = computeDeltaPercent(currentSales, previousSales);
        const share = periodSalesAmount > 0 ? Math.round(((currentSales / periodSalesAmount) * 100) * 10) / 10 : null;
        return {
          ...row,
          deltaSales,
          share,
        };
      })
      .sort((a, b) => b.ventes - a.ventes)
      .slice(0, 5);
  }, [namedTrendRows, agencyPrevById, periodSalesAmount]);
  const comparedAgencies = useMemo(() => {
    const leaderSales = Number(agencyComparisonRows[0]?.ventes) || 0;
    return agencyComparisonRows.map((row, index) => ({
      ...row,
      gapVsLeader:
        index === 0 || leaderSales <= 0
          ? 0
          : Math.round((((Number(row.ventes) - leaderSales) / Math.abs(leaderSales)) * 100) * 10) / 10,
    }));
  }, [agencyComparisonRows]);
  const topAgency = comparedAgencies[0] ?? null;
  const otherAgencies = comparedAgencies.slice(1);

  const topAgencyShare = useMemo(() => {
    if (!topAgency || periodSalesAmount <= 0) return null;
    const share = (topAgency.ventes / periodSalesAmount) * 100;
    return Math.round(share * 10) / 10;
  }, [topAgency, periodSalesAmount]);

  const firstAction = alerts[0] ?? null;
  const secondaryAction = alerts.find((item) => item.actionRoute !== firstAction?.actionRoute) ?? null;
  const ceoPriorityItems = useMemo(() => alerts.slice(0, 3), [alerts]);
  const ceoPriorityCount = useMemo(
    () =>
      ceoPriorityItems.filter(
        (item) => item.severity === "bad" || item.urgency === "immediate" || item.urgency === "today"
      ).length,
    [ceoPriorityItems]
  );
  const defaultPrimaryRoute = `/compagnie/${companyId}/finances?tab=liquidites`;
  const defaultSecondaryRoute = `/compagnie/${companyId}/reservations-reseau`;
  const opportunityLine = useMemo(() => {
    if (!topAgency) return "Aucune agence leader identifiee.";
    if (topAgencyShare != null) {
      return `Levier: capitaliser sur ${topAgency.nom} (${topAgencyShare}% du revenu).`;
    }
    return `Levier: capitaliser sur ${topAgency.nom}.`;
  }, [topAgency, topAgencyShare]);
  const decisionProblemLine = firstAction?.title ?? "Aucun signal critique.";
  const decisionActionLine = firstAction?.action ?? "Maintenir le rythme de controle.";
  const decisionActionRoute = firstAction?.actionRoute ?? defaultPrimaryRoute;
  const decisionActionLabel = firstAction?.actionLabel ?? "Traiter le signal prioritaire";
  const decisionSecondaryRoute = secondaryAction?.actionRoute ?? defaultSecondaryRoute;
  const decisionSecondaryLabel =
    secondaryAction?.actionLabel ??
    (decisionSecondaryRoute.includes("finances") ? "Vue tresorerie" : "Vue reseau");

  const mask = hideTreasury ? "••••••" : null;
  const moneyFocusLine = `Tresorerie ${mask ?? money(ledger?.total ?? 0)} | Encaisse ${money(yesterdayEnc ?? 0)}`;

  const hasPeriodSales = namedTrendRows.some(
    (r) => (Number(r.ventes) || 0) > 0 || (Number(r.colis) || 0) > 0
  );

  const showAgencyRanking = loading || hasPeriodSales;

  const isTodayPeriod = useMemo(() => periodEndStr === getTodayBamako(), [periodEndStr]);

  const riskPotentialUi = useMemo(() => {
    let score = 0;
    if (ecartHier?.status === "critical") score += 30;
    else if (ecartHier?.status === "info") score += 10;

    if (trendVs7 && !trendVs7.stable) {
      if (trendVs7.delta <= -8) score += 20;
      else if (trendVs7.delta <= -3) score += 10;
    }

    if (alerts.some((a) => a.severity === "bad")) score += 20;
    else if (alerts.length > 0) score += 8;

    if (score >= 45) {
      return {
        label: "eleve",
        badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/45 dark:text-red-200",
      };
    }
    if (score >= 22) {
      return {
        label: "modere",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/45 dark:text-amber-200",
      };
    }
    return {
      label: "faible",
      badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/45 dark:text-emerald-200",
    };
  }, [ecartHier?.status, trendVs7, alerts]);

  const dataReliability = useMemo(() => {
    const completenessChecks = [
      ledger?.total != null,
      todayActivity != null,
      yesterdayEnc != null,
      chartForDisplay.length > 0,
      totalAgencies > 0,
      activeAgenciesCount > 0,
    ];
    const completeness = Math.round(
      (completenessChecks.filter(Boolean).length / Math.max(completenessChecks.length, 1)) * 100
    );

    const historyCoverage = Math.min(chartForDisplay.length / 7, 1);
    const agencyCoverage = totalAgencies > 0 ? Math.min(activeAgenciesCount / totalAgencies, 1) : 0;
    const volume = Math.round(historyCoverage * 60 + agencyCoverage * 40);

    let coherencePenalty = 0;
    if (ecartHier?.status === "critical") coherencePenalty += 25;
    if (alerts.some((a) => a.severity === "bad")) coherencePenalty += 20;
    if (trendVs7 == null) coherencePenalty += 10;
    const coherence = Math.max(0, 100 - coherencePenalty);

    const score = Math.round(completeness * 0.45 + volume * 0.25 + coherence * 0.3);
    const level: DataReliabilityLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
    return { level, score, completeness, volume, coherence };
  }, [
    ledger?.total,
    todayActivity,
    yesterdayEnc,
    chartForDisplay.length,
    totalAgencies,
    activeAgenciesCount,
    ecartHier?.status,
    alerts,
    trendVs7,
  ]);

  const reliabilityUi = useMemo(() => {
    if (dataReliability.level === "high") {
      return {
        label: "Elevee",
        badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
        note: "Donnees robustes: arbitrage immediate possible.",
      };
    }
    if (dataReliability.level === "medium") {
      return {
        label: "Moyenne",
        badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
        note: "Lecture exploitable avec verification operationnelle.",
      };
    }
    return {
      label: "Faible",
      badgeClass: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
      note: "Donnees partielles: confirmer avant escalade.",
    };
  }, [dataReliability.level]);

  const riskShellUi = useMemo(() => {
    if (riskPotentialUi.label === "eleve") {
      return {
        shellClass:
          "border-red-200 bg-gradient-to-b from-red-50/85 via-red-50/35 to-white dark:border-red-900/50 dark:from-red-950/35 dark:via-red-950/20 dark:to-transparent",
        panelClass: "border-red-300/70 bg-red-100/80 text-red-900 dark:border-red-800/70 dark:bg-red-950/45 dark:text-red-100",
        label: "Risque global eleve",
      };
    }
    if (riskPotentialUi.label === "modere") {
      return {
        shellClass:
          "border-amber-200 bg-gradient-to-b from-amber-50/80 via-amber-50/35 to-white dark:border-amber-900/50 dark:from-amber-950/25 dark:via-amber-950/15 dark:to-transparent",
        panelClass: "border-amber-300/70 bg-amber-100/80 text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/45 dark:text-amber-100",
        label: "Risque global modere",
      };
    }
    return {
      shellClass:
        "border-emerald-200 bg-gradient-to-b from-emerald-50/75 via-emerald-50/25 to-white dark:border-emerald-900/40 dark:from-emerald-950/20 dark:via-emerald-950/10 dark:to-transparent",
      panelClass: "border-emerald-300/70 bg-emerald-100/80 text-emerald-900 dark:border-emerald-800/70 dark:bg-emerald-950/45 dark:text-emerald-100",
      label: "Risque global faible",
    };
  }, [riskPotentialUi.label]);

  return (
    <div className={cn("w-full space-y-4 rounded-2xl border p-3 sm:space-y-5 sm:p-4", riskShellUi.shellClass)}>
      {/* Carte principale — trésorerie */}
      <section aria-labelledby="ceo-hero-kpi" className="w-full">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setGapSheetOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setGapSheetOpen(true);
            }
          }}
          className={cn(
            DASH_CARD,
            "cursor-pointer border border-gray-100 text-left transition hover:bg-gray-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 dark:border-slate-800 dark:hover:bg-slate-800/50",
            riskShellUi.panelClass
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Landmark className="h-5 w-5 shrink-0 text-gray-600 dark:text-gray-300" aria-hidden />
              <h2
                id="ceo-hero-kpi"
                className="min-w-0 flex-1 text-base font-semibold text-gray-900 dark:text-white"
              >
                Risque global & tresorerie
              </h2>
              <InfoTooltip
                label="Niveau de risque dominant et position cash consolidee."
                className="ml-auto shrink-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", riskPotentialUi.badgeClass)}>
                Niveau {riskPotentialUi.label}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setHideTreasury((v) => !v);
                }}
                className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                title={hideTreasury ? "Afficher les montants" : "Masquer les montants"}
                aria-pressed={hideTreasury}
              >
                {hideTreasury ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
              </button>
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
            {mask ?? money(ledger?.total ?? 0)}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">{periodCaption}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {isTodayPeriod ? "Periode partielle en cours." : "Periode consolidee."}
          </p>
        </div>
      </section>

      <section aria-labelledby="ceo-priority-heading" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 id="ceo-priority-heading" className={sectionTitle}>
            Points d'attention
          </h2>
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
              ceoPriorityCount > 0
                ? "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200"
                : "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200"
            )}
          >
            {ceoPriorityCount > 0 ? `${ceoPriorityCount} a arbitrer` : "stable"}
          </span>
        </div>
        {loading ? (
          <div className={cn(DASH_CARD, "border border-gray-100 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400")}>
            Consolidation des alertes decisionnelles...
          </div>
        ) : ceoPriorityItems.length === 0 ? (
          <div className={cn(DASH_CARD, "border border-gray-100 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300")}>
            Aucune alerte decisionnelle active.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
            {ceoPriorityItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.actionRoute)}
                className={cn(
                  "rounded-xl border p-3 text-left transition hover:shadow-sm",
                  alertRowClass(item.severity, dataReliability.level)
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold leading-tight">{item.title}</p>
                  <span className="rounded-full border border-current/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {severityLabel(item.severity)}
                  </span>
                </div>
                <p className="mt-1 text-xs">{item.impact}</p>
                <p className="mt-2 text-xs font-semibold underline">{item.actionLabel}</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {(loading || todayActivity != null) && (
        <section aria-labelledby="ceo-decision-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="ceo-decision-heading" className={sectionTitle}>
              Decision immediate
            </h2>
            <InfoTooltip label="En 5 secondes: probleme, argent, action." className="shrink-0" />
          </div>
          <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Probleme</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{decisionProblemLine}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Argent</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{moneyFocusLine}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{opportunityLine}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Action</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{decisionActionLine}</p>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(decisionActionRoute)}
                className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100 dark:hover:bg-orange-900/45"
              >
                {decisionActionLabel}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => navigate(decisionSecondaryRoute)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {decisionSecondaryLabel}
              </button>
            </div>
          </div>
        </section>
      )}

      {(loading || todayActivity != null) && (
        <section aria-labelledby="ceo-facts-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="ceo-facts-heading" className={sectionTitle}>
              Vue argent et execution
            </h2>
            <InfoTooltip label="Lecture compacte: cash, execution reseau, controle." className="shrink-0" />
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <div className="flex items-center justify-between gap-2">
                <span className={kpiLabel}>Argent disponible</span>
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", toneBadgeClass(treasuryTone))}>
                  {toneLabel(treasuryTone)}
                </span>
              </div>
              <p className={cn(kpiAmount, "mt-2 text-gray-900 dark:text-white")}>
                {loading ? "..." : mask ?? money(ledger?.total ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Encaisse: {loading ? "..." : money(yesterdayEnc ?? 0)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Couverture vs activite: {formatDeltaPercent(encaissementCoverageDelta)}
              </p>
            </div>

            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <div className="flex items-center justify-between gap-2">
                <span className={kpiLabel}>{singleDayPeriod ? "Execution jour" : "Execution periode"}</span>
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", toneBadgeClass(salesTone))}>
                  {formatDeltaPercent(salesDelta)}
                </span>
              </div>
              <p className={cn(kpiAmount, "mt-2 text-gray-900 dark:text-white")}>
                {loading ? "..." : money(periodSalesAmount)}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Billets {loading ? "..." : periodBillets} | Colis {loading ? "..." : periodColis}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {trendVs7 ? `Tendance ${trendPhrase(trendVs7.stable, trendVs7.delta)} (${formatDeltaPercent(trendVs7.delta)})` : "Tendance en observation"}
              </p>
              <div className="mt-3 flex h-12 items-end gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50">
                {sparklineBars.map((bar) => (
                  <span
                    key={bar.key}
                    className={cn(
                      "w-full min-w-[3px] rounded-sm",
                      trendVs7 && trendVs7.delta > 0 && "bg-emerald-400/85 dark:bg-emerald-500/75",
                      trendVs7 && trendVs7.delta < 0 && "bg-orange-400/85 dark:bg-orange-500/75",
                      (!trendVs7 || trendVs7.delta === 0) && "bg-slate-400/85 dark:bg-slate-500/75"
                    )}
                    style={{ height: `${bar.height}%` }}
                    title={money(bar.amount)}
                  />
                ))}
              </div>
            </div>

            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <div className="flex items-center justify-between gap-2">
                <span className={kpiLabel}>Controle financier</span>
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", toneBadgeClass(encaissementTone))}>
                  {ecartHier?.statutLabel ?? "N/A"}
                </span>
              </div>
              <p className={cn(kpiAmount, "mt-2 text-gray-900 dark:text-white")}>
                {loading ? "..." : `${activeAgenciesCount}/${totalAgencies}`}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Agences actives ({formatDeltaPercent(activeAgenciesDelta)})
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Fiabilite: {loading ? "..." : `${dataReliability.score}/100`} - {reliabilityUi.note}
              </p>
              <span className={cn("mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", reliabilityUi.badgeClass)}>
                {reliabilityUi.label}
              </span>
            </div>
          </div>
        </section>
      )}

      {showAgencyRanking && (
        <section aria-labelledby="ceo-agency-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="ceo-agency-heading" className={sectionTitle}>
              Comparatif agences
            </h2>
            <InfoTooltip label="TOP 1 en avant. Les autres agences affichent un ecart clair." className="shrink-0" />
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <h3 className={kpiLabel}>Leader ({trendDayCount} j.)</h3>
              {loading ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chargement...</p>
              ) : topAgency ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/25">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700 dark:text-emerald-300">
                    TOP 1
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-slate-900 dark:text-slate-100">{topAgency.nom}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{money(topAgency.ventes)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", deltaBadgeClass(topAgency.deltaSales))}>
                      {formatDeltaPercent(topAgency.deltaSales)} vs periode prec.
                    </span>
                    {topAgency.share != null ? (
                      <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        {topAgency.share}% du revenu
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Aucune activite agence sur la periode.</p>
              )}
            </div>

            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <h3 className={kpiLabel}>Rang 2 a 5</h3>
              {loading ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chargement...</p>
              ) : otherAgencies.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {otherAgencies.map((agency, index) => (
                    <li
                      key={agency.agencyId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 opacity-75 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {index + 2}. {agency.nom}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {agency.gapVsLeader === 0 ? "Reference leader" : `${formatDeltaPercent(agency.gapVsLeader)} vs leader`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {money(agency.ventes)}
                        </p>
                        <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", deltaBadgeClass(agency.deltaSales))}>
                          {formatDeltaPercent(agency.deltaSales)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Pas encore de comparatif disponible.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {(loading || alerts.length > 0) && (
        <section aria-labelledby="ceo-actions-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="ceo-actions-heading" className={sectionTitle}>
              Signaux a suivre
            </h2>
            <InfoTooltip label="Lecture synthese des causes, impacts et actions recommandees." className="shrink-0" />
          </div>
          {dataReliability.level === "low" ? (
            <div className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200">
              Fiabilite faible: confirmer les signaux avant escalade.
            </div>
          ) : null}
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Chargement...</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
              {alerts.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "rounded-xl border p-3 text-sm shadow-sm",
                    alertRowClass(item.severity, dataReliability.level),
                    dataReliability.level === "low" ? "opacity-80" : ""
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-tight">{item.title}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        item.severity === "bad" ? "bg-red-100 text-red-800 dark:bg-red-900/45 dark:text-red-200" : "bg-orange-100 text-orange-800 dark:bg-orange-900/45 dark:text-orange-200"
                      )}
                    >
                      {severityLabel(item.severity)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs"><span className="font-semibold">Cause:</span> {item.cause}</p>
                  <p className="mt-1 text-xs"><span className="font-semibold">Impact:</span> {item.impact}</p>
                  <p className="mt-1 text-xs"><span className="font-semibold">Action:</span> {item.action}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {gapSheetOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 dark:bg-black/60"
            aria-hidden
            onClick={() => setGapSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ceo-gap-sheet-title"
            className="fixed inset-x-0 bottom-0 z-[51] max-h-[min(85vh,520px)] overflow-y-auto rounded-t-[1.75rem] border border-white/80 bg-white/95 px-5 pb-8 pt-4 shadow-2xl shadow-slate-400/30 backdrop-blur-md dark:border-white/10 dark:bg-gray-900/95 dark:shadow-black/50"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="ceo-gap-sheet-title" className="text-lg font-semibold text-gray-900 dark:text-white">
                  Classement par agence (dernier jour affiché)
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Volume enregistré ce jour-là — à rapprocher des encaissements dans Finances.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGapSheetOpen(false)}
                className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            {top3YesterdayByActivity.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Pas encore de répartition par agence.</p>
            ) : (
              <ul className="space-y-3">
                {top3YesterdayByActivity.map((a, i) => (
                  <li
                    key={a.agencyId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/80"
                  >
                    <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                      {i + 1}. {a.nom}
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {money(a.ventes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setGapSheetOpen(false)}
              className="mt-6 w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
            >
              Fermer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

