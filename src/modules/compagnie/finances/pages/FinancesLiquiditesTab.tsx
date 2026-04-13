/**
 * Section "Argent disponible" - liquidite ledger (total, caisse, banque)
 * + encaissements en ligne par moyen.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { collection, getDoc, getDocs, doc, limit, orderBy, query, where } from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useGlobalMoneyPositions } from "@/contexts/GlobalMoneyPositionsContext";
import { SectionCard, MetricCard } from "@/ui";
import { dashboardKpiMinWidth } from "@/ui/foundation";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";
import { getLedgerBalances } from "@/modules/compagnie/treasury/financialTransactions";
import { AlertTriangle, Landmark, Smartphone, Wallet } from "lucide-react";
import {
  aggregateOnlinePaidByPreuveVia,
  mergePaymentMethodDisplayKeys,
  type ReservationLike,
} from "../financesCeoPaymentAggregation";
import {
  resolveLiquidCompanyColors,
  liquidityMetricCardBaseClassName,
  liquidityMetricIconClassName,
  liquidMetricValueColor,
  liquidMetricAccentForVariant,
} from "../financesLiquidityCardStyles";
import { useHtmlDarkClass } from "@/shared/hooks/useHtmlDarkClass";
import InfoTooltip from "@/shared/ui/InfoTooltip";
import { TZ_BAMAKO } from "@/shared/date/dateUtilsTz";
import { cn } from "@/lib/utils";

dayjs.extend(utc);
dayjs.extend(timezone);

type ConfiguredMethod = { id: string; name: string };
type SignalTone = "positive" | "neutral" | "negative";

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
  if (delta == null || Number.isNaN(delta)) return "n/d";
  if (delta === 0) return "0%";
  return `${delta > 0 ? "+" : ""}${delta}%`;
}

function toneBadgeClass(tone: SignalTone): string {
  if (tone === "positive") {
    return "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/45 dark:text-emerald-200";
  }
  if (tone === "negative") {
    return "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-700 dark:bg-orange-900/45 dark:text-orange-200";
  }
  return "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
}

function toneBorderClass(tone: SignalTone): string {
  if (tone === "positive") return "border-l-emerald-500";
  if (tone === "negative") return "border-l-orange-500";
  return "border-l-slate-400";
}

function toneLabel(tone: SignalTone): string {
  if (tone === "positive") return "positif";
  if (tone === "negative") return "risque";
  return "neutre";
}

export default function FinancesLiquiditesTab() {
  const navigate = useNavigate();
  const { user, company } = useAuth();
  const { primary, secondary } = useMemo(() => resolveLiquidCompanyColors(company ?? undefined), [company]);
  const isDark = useHtmlDarkClass();
  const { companyId: routeId } = useParams<{ companyId: string }>();
  const companyId = routeId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();
  const positions = useGlobalMoneyPositions();

  const [ledger, setLedger] = useState<{ total: number; cash: number; mobileMoney: number; bank: number } | null>(null);
  const [methods, setMethods] = useState<ConfiguredMethod[]>([]);
  const [companyPaymentMethodKeys, setCompanyPaymentMethodKeys] = useState<string[]>([]);
  const [reservationRows, setReservationRows] = useState<ReservationLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [financeCurrent, setFinanceCurrent] = useState<{ caNet: number; sales: number } | null>(null);
  const [financePrevious, setFinancePrevious] = useState<{ caNet: number; sales: number } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const companyRef = doc(db, "companies", companyId);
        const [bal, pmSnap, companySnap, paymentsSnap] = await Promise.all([
          getLedgerBalances(companyId),
          getDocs(query(collection(db, "paymentMethods"), where("companyId", "==", companyId))),
          getDoc(companyRef),
          getDocs(
            query(
              collection(db, "companies", companyId, "payments"),
              orderBy("createdAt", "desc"),
              limit(1500)
            )
          ),
        ]);
        if (cancelled) return;

        const pmRoot = companySnap.exists()
          ? (companySnap.data() as { paymentMethods?: Record<string, unknown> }).paymentMethods
          : undefined;
        const mirrorKeys = pmRoot && typeof pmRoot === "object" ? Object.keys(pmRoot) : [];

        const mth: ConfiguredMethod[] = pmSnap.docs.map((d) => {
          const x = d.data() as { name?: string };
          return { id: d.id, name: String(x.name ?? "").trim() };
        });
        mth.sort((a, b) => a.name.localeCompare(b.name, "fr"));

        // Source de verite finance: seulement paiements online valides ET ledger postes.
        const resRows: ReservationLike[] = [];
        paymentsSnap.docs.forEach((d) => {
          const p = d.data() as {
            status?: string;
            ledgerStatus?: string;
            channel?: string;
            amount?: number;
            provider?: string;
          };
          if (String(p.status ?? "") !== "validated") return;
          if (String(p.ledgerStatus ?? "") !== "posted") return;
          if (String(p.channel ?? "") !== "online") return;
          resRows.push({
            paymentChannel: "online",
            paymentStatus: "paid",
            preuveVia: String(p.provider ?? "inconnu"),
            montant: Number(p.amount ?? 0) || 0,
          });
        });

        if (cancelled) return;
        setLedger({
          total: bal.total,
          cash: bal.cash,
          mobileMoney: bal.mobileMoney,
          bank: bal.bank,
        });
        setMethods(mth);
        setCompanyPaymentMethodKeys(mirrorKeys);
        setReservationRows(resRows);
      } catch (e) {
        console.error("[FinancesLiquiditesTab]", e);
        setLedger(null);
        setMethods([]);
        setCompanyPaymentMethodKeys([]);
        setReservationRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    (async () => {
      try {
        const start = globalPeriod.startDate;
        const end = globalPeriod.endDate;
        const startDj = dayjs.tz(`${start}T12:00:00`, TZ_BAMAKO);
        const endDj = dayjs.tz(`${end}T12:00:00`, TZ_BAMAKO);
        const periodLen = Math.max(1, endDj.diff(startDj, "day") + 1);
        const prevEnd = startDj.subtract(1, "day");
        const prevStart = prevEnd.subtract(periodLen - 1, "day");
        const prevStartStr = prevStart.format("YYYY-MM-DD");
        const prevEndStr = prevEnd.format("YYYY-MM-DD");

        const [current, previous] = await Promise.all([
          getUnifiedCompanyFinance(companyId, start, end),
          getUnifiedCompanyFinance(companyId, prevStartStr, prevEndStr),
        ]);
        if (cancelled) return;
        setFinanceCurrent({
          caNet: current.activity.caNet,
          sales: current.activity.sales.amountHint,
        });
        setFinancePrevious({
          caNet: previous.activity.caNet,
          sales: previous.activity.sales.amountHint,
        });
      } catch (e) {
        console.error("[FinancesLiquiditesTab] period signals", e);
        if (!cancelled) {
          setFinanceCurrent(null);
          setFinancePrevious(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

  const { paymentTotals, reservationsAmountSum, includedCount } = useMemo(
    () => aggregateOnlinePaidByPreuveVia(reservationRows),
    [reservationRows]
  );

  const displayKeys = useMemo(
    () =>
      mergePaymentMethodDisplayKeys({
        paymentTotals,
        configuredMethodNames: methods.map((m) => m.name).filter(Boolean),
        companyPaymentMethodFieldKeys: companyPaymentMethodKeys,
      }),
    [paymentTotals, methods, companyPaymentMethodKeys]
  );

  useEffect(() => {
    const shownSum = displayKeys.reduce((s, k) => s + (paymentTotals.get(k) ?? 0), 0);
    if (Math.abs(shownSum - reservationsAmountSum) > 0.01) {
      console.error("[Finances] Total affiche (moyens) != somme reservations payees en ligne", {
        shownSum,
        reservationsAmountSum,
        displayKeysCount: displayKeys.length,
      });
    }
  }, [displayKeys, paymentTotals, reservationsAmountSum]);

  const totalsCoherent = useMemo(() => {
    if (!ledger) return false;
    const recomputed = ledger.cash + ledger.mobileMoney + ledger.bank;
    return Math.abs(ledger.total - recomputed) <= 1;
  }, [ledger]);

  const totalDisplay = useMemo(() => {
    if (loading && !ledger) return null;
    if (!ledger) return "unavailable" as const;
    if (!totalsCoherent) return "unavailable" as const;
    return "ok" as const;
  }, [loading, ledger, totalsCoherent]);

  const treasuryDelta = useMemo(
    () => computeDeltaPercent(financeCurrent?.caNet ?? 0, financePrevious?.caNet ?? 0),
    [financeCurrent?.caNet, financePrevious?.caNet]
  );

  const treasuryTone: SignalTone = useMemo(() => {
    if (!financeCurrent) return "neutral";
    if (financeCurrent.caNet <= 0) return "negative";
    if (treasuryDelta != null && treasuryDelta < -5) return "negative";
    if (treasuryDelta != null && treasuryDelta > 5) return "positive";
    return "neutral";
  }, [financeCurrent, treasuryDelta]);

  const cashRatio = useMemo(() => {
    if (!ledger || ledger.total <= 0) return null;
    return Math.round(((ledger.cash / ledger.total) * 100) * 10) / 10;
  }, [ledger]);

  const cashRatioTone: SignalTone = useMemo(() => {
    if (cashRatio == null) return "neutral";
    if (cashRatio >= 75) return "negative";
    if (cashRatio >= 55) return "neutral";
    return "positive";
  }, [cashRatio]);

  const pendingBrut = positions.snapshot.pendingGuichet;
  const pendingRatio = useMemo(() => {
    if (!ledger || ledger.total <= 0) return null;
    return Math.round(((pendingBrut / ledger.total) * 100) * 10) / 10;
  }, [ledger, pendingBrut]);

  const pendingRiskHigh = (pendingRatio ?? 0) >= 20;
  const zeroActivityRisk = (financeCurrent?.sales ?? 0) <= 0;
  const byAgencyCash = positions.snapshot.byAgency;

  const dependencySignal = useMemo(() => {
    const rows = Object.entries(byAgencyCash).map(([agencyId, values]) => ({
      agencyId,
      amount: Number(values.cashPaid ?? 0),
    }));
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    if (total <= 0 || rows.length === 0) {
      return { topAgencyId: null as string | null, share: 0 };
    }
    const top = [...rows].sort((a, b) => b.amount - a.amount)[0];
    return {
      topAgencyId: top.agencyId,
      share: Math.round(((top.amount / total) * 100) * 10) / 10,
    };
  }, [byAgencyCash]);

  const dependencyRiskHigh = dependencySignal.share >= 60;
  const globalRiskScore = (pendingRiskHigh ? 2 : 0) + (zeroActivityRisk ? 2 : 0) + (dependencyRiskHigh ? 1 : 0);
  const globalRiskTone: SignalTone =
    globalRiskScore >= 3 ? "negative" : globalRiskScore >= 1 ? "neutral" : "positive";
  const globalRiskLabel = globalRiskTone === "negative" ? "critique" : globalRiskTone === "neutral" ? "attention" : "maitrise";
  const globalRiskAction = pendingRiskHigh
    ? {
        label: "Valider les guichets",
        route: `/compagnie/${companyId}/comptabilite/validation`,
      }
    : zeroActivityRisk
      ? {
          label: "Verifier activite reseau",
          route: `/compagnie/${companyId}/reservations-reseau`,
        }
      : dependencyRiskHigh
        ? {
            label: "Analyser agences",
            route: `/compagnie/${companyId}/reservations-reseau`,
          }
        : {
            label: "Ouvrir finances",
            route: `/compagnie/${companyId}/finances`,
          };

  return (
    <section aria-labelledby="finances-argent-disponible" className="space-y-4">
      <SectionCard
        title="Argent disponible"
        icon={Wallet}
        help={
          <InfoTooltip label="Solde reel consolide (caisse agences + banque). Repartition calculee depuis les paiements effectivement recus." />
        }
      >
        {loading && !ledger ? (
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[110px] animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/55">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Niveau de risque global</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {globalRiskTone === "negative"
                      ? "Risque eleve sur la liquidite."
                      : globalRiskTone === "neutral"
                        ? "Risque modere a surveiller."
                        : "Risque faible sur la periode."}
                  </p>
                </div>
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", toneBadgeClass(globalRiskTone))}>
                  {globalRiskLabel}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {pendingRiskHigh
                  ? "Cash non valide trop eleve."
                  : zeroActivityRisk
                    ? "Activite commerciale nulle."
                    : dependencyRiskHigh
                      ? `Dependance agence elevee (${dependencySignal.share}%).`
                      : "Aucun signal critique detecte."}
              </p>
              <button
                type="button"
                onClick={() => navigate(globalRiskAction.route)}
                className={cn(
                  "mt-2 inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold",
                  globalRiskTone === "negative" &&
                    "border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/35 dark:text-red-100 dark:hover:bg-red-900/45",
                  globalRiskTone === "neutral" &&
                    "border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100 dark:hover:bg-orange-900/45",
                  globalRiskTone === "positive" &&
                    "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-100 dark:hover:bg-emerald-900/45"
                )}
              >
                {globalRiskAction.label}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Total disponible"
                value={totalDisplay === "ok" && ledger ? money(ledger.total) : "Donnee non disponible"}
                hint={`Signal ${toneLabel(treasuryTone)}`}
                variation={formatDeltaPercent(treasuryDelta)}
                variationLabel="vs periode precedente"
                icon={Wallet}
                className={`${liquidityMetricCardBaseClassName} ${dashboardKpiMinWidth} h-full border-l-4 ${toneBorderClass(treasuryTone)}`}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
              <MetricCard
                label="Caisse (agences)"
                value={ledger ? money(ledger.cash) : "Donnee non disponible"}
                hint={`Signal ${toneLabel(cashRatioTone)}`}
                variation={cashRatio != null ? `${cashRatio}%` : "n/d"}
                variationLabel="part du total"
                critical={pendingRiskHigh}
                criticalMessage={pendingRiskHigh ? "Part de cash non validee elevee." : undefined}
                icon={Wallet}
                className={`${liquidityMetricCardBaseClassName} ${dashboardKpiMinWidth} h-full border-l-4 ${toneBorderClass(cashRatioTone)}`}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
              <MetricCard
                label="Mobile money"
                value={ledger ? money(ledger.mobileMoney) : "Donnee non disponible"}
                icon={Smartphone}
                className={`${liquidityMetricCardBaseClassName} ${dashboardKpiMinWidth} h-full`}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
              <MetricCard
                label="Banque (entreprise)"
                value={ledger ? money(ledger.bank) : "Donnee non disponible"}
                icon={Landmark}
                className={`${liquidityMetricCardBaseClassName} ${dashboardKpiMinWidth} h-full`}
                iconWrapperClassName={liquidityMetricIconClassName}
              />
            </div>

            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/55">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Signal risque</p>
                  <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", toneBadgeClass(pendingRiskHigh || zeroActivityRisk ? "negative" : "neutral"))}>
                    {pendingRiskHigh || zeroActivityRisk ? "a traiter" : "sous controle"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  {pendingRiskHigh
                    ? `Cash non valide: ${pendingRatio}% du total disponible.`
                    : zeroActivityRisk
                      ? "Activite nulle sur la periode: verifier les agences."
                      : "Pas de signal bloquant de liquidite sur la periode."}
                </p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/55">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Action recommandee</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  {pendingRiskHigh
                    ? "Prioriser les validations guichet pour reduire le cash en attente."
                    : zeroActivityRisk
                      ? "Verifier l'ouverture des guichets et les canaux en ligne."
                      : "Conserver le rythme de controle quotidien des flux."}
                </p>
                {pendingRatio != null ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Argent en attente (guichets): {money(pendingBrut)} ({pendingRatio}%)
                  </p>
                ) : null}
                {(pendingRiskHigh || zeroActivityRisk) ? (
                  <button
                    type="button"
                    onClick={() => navigate(pendingRiskHigh ? `/compagnie/${companyId}/comptabilite/validation` : `/compagnie/${companyId}/reservations-reseau`)}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100 dark:hover:bg-orange-900/45"
                  >
                    {pendingRiskHigh ? "Valider les guichets" : "Verifier activite"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Paiements en ligne par moyen</h3>
                <InfoTooltip label="Liste dynamique des moyens reels vus dans les reservations en ligne payees (champ preuve)." />
              </div>
              {displayKeys.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
                  Aucun moyen en ligne detecte. Verifiez la configuration des moyens et l'activite des agences.
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {displayKeys.map((key, i) => (
                    <li
                      key={key}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/60"
                    >
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 dark:bg-slate-700">
                          <Smartphone className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-100">{key}</span>
                      </div>
                      <span
                        className="font-semibold tabular-nums"
                        style={{
                          color: liquidMetricValueColor(liquidMetricAccentForVariant("payment", primary, secondary, i), isDark),
                        }}
                      >
                        {money(paymentTotals.get(key) ?? 0)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {includedCount > 0 ? (
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
                  {includedCount} reservation{includedCount > 1 ? "s" : ""} - total {money(reservationsAmountSum)}
                </p>
              ) : null}
            </div>

            {(pendingRiskHigh || zeroActivityRisk) && (
              <div className="mt-2 flex items-start gap-2 rounded-xl border border-orange-300 bg-orange-50 px-3 py-2 text-xs text-orange-900 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Surveillance recommandee: {pendingRiskHigh ? "cash non valide eleve." : "activite periode nulle."}
                </span>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </section>
  );
}

