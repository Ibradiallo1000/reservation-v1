/**
 * Dashboard CEO — lecture stratégique sans recalcul métier.
 * Sources : getUnifiedCommercialActivity, getUnifiedCompanyFinance,
 * getNetworkStatsChartData, getNetworkActivityByAgency.
 */
import React, { useEffect, useMemo, useState } from "react";
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
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";
import { getUnifiedCommercialActivity } from "@/modules/compagnie/networkStats/activityCore";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { getNetworkStatsChartData } from "@/modules/compagnie/networkStats/networkStatsService";
import {
  getNetworkActivityByAgency,
  type AgencyActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import type { PeriodKind } from "@/shared/date/periodUtils";
import {
  Activity,
  Building2,
  Eye,
  EyeOff,
  Landmark,
  Minus,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import InfoTooltip from "@/shared/ui/InfoTooltip";
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
type EcartHierStatus = "critical" | "ok" | "info";

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

function alertDefaultAction(sev: AlertSeverity): string {
  return sev === "bad" ? "Traiter en priorité avec le réseau" : "Suivre le point avec les agences";
}

function trendPhrase(stable: boolean, delta: number): string {
  if (stable) return "stable";
  return delta >= 0 ? "en hausse" : "en baisse";
}

/** Carte dashboard (style unique mobile / desktop). */
const DASH_CARD =
  "rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-5";

const sectionTitle = "text-base font-semibold tracking-tight text-gray-900 dark:text-white";

const kpiLabel = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

const kpiAmount =
  "text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50";

const iconBox =
  "mb-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-200";

type AgencyNamedRow = AgencyActivityRow & { nom: string };

export default function CeoPilotageDashboard({
  companyId,
  periodStartStr,
  periodEndStr,
}: Props) {
  const money = useFormatCurrency();
  const { currency } = useCurrency();
  const { company } = useAuth();
  const { primary: themePrimary, secondary: themeSecondary } = useMemo(
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

  const topAgencies = useMemo(() => [...namedTrendRows].sort((a, b) => b.ventes - a.ventes).slice(0, 3), [namedTrendRows]);
  const weakAgencies = useMemo(() => [...namedTrendRows].sort((a, b) => a.ventes - b.ventes).slice(0, 3), [namedTrendRows]);

  const mask = hideTreasury ? "••••••" : null;

  const hasPeriodSales = namedTrendRows.some(
    (r) => (Number(r.ventes) || 0) > 0 || (Number(r.colis) || 0) > 0
  );

  const showAgenciesKpi = loading || totalAgencies > 0;
  const showActivityChart = loading || chartPoints.length > 0;
  const showAgencyRanking = loading || hasPeriodSales;

  const heroEcartBorder =
    ecartHier?.status === "critical"
      ? "border-l-4 border-l-red-500"
      : ecartHier?.status === "info"
        ? "border-l-4 border-l-amber-500"
        : ecartHier?.status === "ok"
          ? "border-l-4 border-l-emerald-500"
          : "";

  return (
    <div className="w-full space-y-4">
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
            heroEcartBorder
          )}
        >
          <div className="flex w-full min-w-0 items-center gap-2">
            <Landmark className="h-5 w-5 shrink-0 text-gray-600 dark:text-gray-300" aria-hidden />
            <h2
              id="ceo-hero-kpi"
              className="min-w-0 flex-1 text-base font-semibold text-gray-900 dark:text-white"
            >
              Trésorerie disponible
            </h2>
            <InfoTooltip
              label="Montants agrégés caisse, banque et mobile money, selon la période choisie."
              className="ml-auto shrink-0"
            />
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
          <p className="mt-4 text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
            {mask ?? money(ledger?.total ?? 0)}
          </p>
          <p className="mt-1 text-xs font-medium text-gray-500 dark:text-gray-400">{periodCaption}</p>
        </div>
      </section>

      {(loading || alerts.length > 0) && (
        <section aria-labelledby="ceo-alerts-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="ceo-alerts-heading" className={sectionTitle}>
              Alertes
            </h2>
            <InfoTooltip label="Points à traiter, détectés sur la période sélectionnée." className="shrink-0" />
          </div>
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
          ) : (
            <ul className="space-y-3">
              {alerts.map((item, i) => (
                <li
                  key={i}
                  className={cn(
                    "rounded-xl border px-4 py-4 text-sm shadow-sm",
                    alertRowClass(item.severity)
                  )}
                >
                  <div className="flex gap-2">
                    <span
                      className={cn(
                        "shrink-0 font-bold",
                        item.severity === "bad"
                          ? "text-red-800 dark:text-red-200"
                          : "text-orange-900 dark:text-orange-200"
                      )}
                    >
                      {i + 1}.
                    </span>
                    <span className="font-medium">{item.message}</span>
                  </div>
                  <p className="mt-3 border-t border-black/5 pt-3 text-xs font-semibold text-gray-900 dark:border-white/10 dark:text-white">
                    Action : {item.action ?? alertDefaultAction(item.severity)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {(loading || todayActivity != null) && (
        <section aria-labelledby="ceo-live-kpis" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div id="ceo-live-kpis" className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
            <div className={iconBox}>
              <Activity className="h-5 w-5" aria-hidden />
            </div>
            <span className={kpiLabel}>
              {singleDayPeriod ? "Activité (jour affiché)" : "Activité (période)"}
            </span>
            <p className={cn(kpiAmount, "mt-2 text-gray-900 dark:text-white")}>
              {loading ? "…" : money(todayActivity ?? 0)}
            </p>
          </div>
          {showAgenciesKpi ? (
            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <div className={iconBox}>
                <Building2 className="h-5 w-5" aria-hidden />
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className={kpiLabel}>Agences actives</span>
                <InfoTooltip
                  label="Agences ayant enregistré au moins une vente ou un colis sur la période."
                  className="shrink-0"
                />
              </div>
              <p className={cn(kpiAmount, "mt-2 text-gray-900 dark:text-white")}>
                {loading ? (
                  "…"
                ) : (
                  <>
                    {activeAgenciesCount}
                    <span className="text-lg font-semibold text-slate-400 dark:text-slate-500">
                      {" "}
                      / {totalAgencies}
                    </span>
                  </>
                )}
              </p>
            </div>
          ) : null}
        </section>
      )}

      {showActivityChart && (
        <section aria-labelledby="ceo-trend-heading" className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 id="ceo-trend-heading" className={sectionTitle}>
              Activité
            </h2>
            <InfoTooltip label="Courbes basées sur les agrégations réseau pour la période." className="shrink-0" />
          </div>
          <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
            {chartForDisplay.length > 0 ? (
              <div className="min-h-[200px] w-full">
                <RevenueReservationsChart
                  data={chartForDisplay}
                  loading={loading}
                  range={chartForDisplay.length <= 8 ? "week" : "month"}
                  primaryColor={themePrimary}
                  secondaryColor={themeSecondary}
                  secondaryMetricLabel="Places (billets)"
                />
              </div>
            ) : loading ? (
              <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Chargement…
              </div>
            ) : null}
            {trendVs7 && chartForDisplay.length >= 2 ? (
              <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                <span>Tendance :</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    trendVs7.stable && "text-slate-700 dark:text-slate-200",
                    !trendVs7.stable && trendVs7.delta >= 0 && "text-emerald-700 dark:text-emerald-300",
                    !trendVs7.stable && trendVs7.delta < 0 && "text-orange-700 dark:text-orange-300"
                  )}
                >
                  {!trendVs7.stable && trendVs7.delta >= 0 ? (
                    <TrendingUp className="h-4 w-4 shrink-0" aria-hidden />
                  ) : !trendVs7.stable && trendVs7.delta < 0 ? (
                    <TrendingDown className="h-4 w-4 shrink-0" aria-hidden />
                  ) : (
                    <Minus className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                  {trendPhrase(trendVs7.stable, trendVs7.delta)}
                </span>
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  ({trendVs7.delta}% vs moyenne des autres jours)
                </span>
              </p>
            ) : null}
          </div>
        </section>
      )}

      {showAgencyRanking && (
        <div
          className={cn(
            "grid grid-cols-1 gap-3",
            (loading || (topAgencies.length > 0 && weakAgencies.length > 0)) && "sm:grid-cols-2"
          )}
        >
          {(loading || topAgencies.some((a) => a.ventes > 0 || a.colis > 0)) && (
            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <h3 className={kpiLabel}>Top agences ({trendDayCount} j.)</h3>
              {loading ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chargement…</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {topAgencies.map((a, i) => (
                    <li
                      key={a.agencyId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {i + 1}. {a.nom}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {money(a.ventes)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {(loading || weakAgencies.some((a) => a.ventes > 0 || a.colis > 0)) && (
            <div className={cn(DASH_CARD, "border border-gray-100 dark:border-slate-800")}>
              <h3 className={kpiLabel}>Agences les plus basses ({trendDayCount} j.)</h3>
              {loading ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Chargement…</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {weakAgencies.map((a, i) => (
                    <li
                      key={a.agencyId}
                      className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {i + 1}. {a.nom}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {money(a.ventes)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
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
