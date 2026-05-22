import React from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  Crown,
  Lock,
  Route as RouteIcon,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { StandardLayoutWrapper } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyPlan } from "@/core/hooks/useCompanyPlan";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { cn } from "@/lib/utils";
import {
  useCeoInsights,
  type CeoAgencyInsight,
  type CeoAlert,
  type CeoInsightsPeriod,
  type CeoRecommendation,
  type CeoRouteInsight,
} from "@/modules/compagnie/ceo/useCeoInsights";

const PERIOD_OPTIONS: Array<{ id: CeoInsightsPeriod; label: string }> = [
  { id: "today", label: "Aujourd'hui" },
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
];

function formatGrowth(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })}%`;
}

function percentage(value: number | null) {
  if (value == null) return "--";
  return `${Math.round(value * 100)}%`;
}

function ImpactBadge({
  impact,
  currency,
  label = "Impact estime",
}: {
  impact: number;
  currency: string;
  label?: string;
}) {
  if (impact <= 0) return null;

  const lowImpact = impact < 5000;

  return (
    <div className="mt-2">
      <p className="text-sm font-semibold text-red-600 dark:text-red-300">
        {label} : {lowImpact ? "~ faible impact" : `-${formatCurrency(impact, currency)}`}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Estimation basee sur donnees recentes
      </p>
    </div>
  );
}

function CeoHeader({
  plan,
  period,
  onPeriodChange,
}: {
  plan: string;
  period: CeoInsightsPeriod;
  onPeriodChange: (period: CeoInsightsPeriod) => void;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
              <Crown className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                Cockpit CEO
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                Pilotage strategique
              </h1>
            </div>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Une lecture unique pour decider vite : revenu, alertes reseau, agences a renforcer et
            routes a corriger.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
              plan === "premium"
                ? "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            )}
          >
            Plan {plan === "premium" ? "PREMIUM" : "STANDARD"}
          </span>
          <div className="flex flex-wrap gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {PERIOD_OPTIONS.map((option) => {
              const active = option.id === period;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPeriodChange(option.id)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                    active
                      ? "bg-white text-slate-950 shadow-sm dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function HealthCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative";
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {value}
      </p>
      {hint ? (
        <p
          className={cn(
            "mt-2 text-sm",
            tone === "positive" && "text-emerald-600 dark:text-emerald-300",
            tone === "negative" && "text-orange-600 dark:text-orange-300",
            tone === "default" && "text-slate-500 dark:text-slate-400"
          )}
        >
          {hint}
        </p>
      ) : null}
    </article>
  );
}

function HealthSection({
  loading,
  revenueToday,
  revenuePeriod,
  growth,
  activeAgencies,
  currency,
}: {
  loading: boolean;
  revenueToday: number;
  revenuePeriod: number;
  growth: number;
  activeAgencies: number;
  currency: string;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <HealthCard
        label="Revenu du jour"
        value={loading ? "--" : formatCurrency(revenueToday, currency)}
        hint="Vue immediate"
      />
      <HealthCard
        label="Revenu periode"
        value={loading ? "--" : formatCurrency(revenuePeriod, currency)}
        hint="Base de decision"
      />
      <HealthCard
        label="Croissance"
        value={loading ? "--" : formatGrowth(growth)}
        hint={growth >= 0 ? "vs periode precedente" : "a surveiller"}
        tone={growth >= 0 ? "positive" : "negative"}
      />
      <HealthCard
        label="Agences actives"
        value={loading ? "--" : activeAgencies.toLocaleString("fr-FR")}
        hint="Agences qui produisent"
      />
    </section>
  );
}

function AlertsSection({
  alerts,
  loading,
  isPremium,
  companyId,
  currency,
}: {
  alerts: CeoAlert[];
  loading: boolean;
  isPremium: boolean;
  companyId: string;
  currency: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Alertes</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Les points qui demandent une decision rapide.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Chargement des alertes...
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            Aucune alerte critique pour le moment.
          </div>
        ) : (
          alerts.map((alert) => (
            <article
              key={alert.id}
              className={cn(
                "rounded-xl border px-4 py-4",
                alert.severity === "critical" &&
                  "border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10",
                alert.severity === "warning" &&
                  "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10",
                alert.severity === "info" &&
                  "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{alert.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{alert.detail}</p>
                  <ImpactBadge impact={alert.impact} currency={currency} />
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    alert.severity === "critical" &&
                      "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
                    alert.severity === "warning" &&
                      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                    alert.severity === "info" &&
                      "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                  )}
                >
                  {alert.severity === "critical"
                    ? "Critique"
                    : alert.severity === "warning"
                      ? "A surveiller"
                      : "Information"}
                </span>
              </div>
              {!isPremium ? (
                <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
                  <Link
                    to={`/compagnie/${companyId}/parametres/plan`}
                    className="text-sm font-medium text-orange-700 transition hover:text-orange-600 dark:text-orange-300 dark:hover:text-orange-200"
                  >
                    Action recommandee disponible en Premium
                  </Link>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function RecommendationsSection({
  companyId,
  isPremium,
  loading,
  recommendations,
  currency,
}: {
  companyId: string;
  isPremium: boolean;
  loading: boolean;
  recommendations: CeoRecommendation[];
  currency: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300">
          <Sparkles className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Recommandations</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Suggestions simples pour agir sur le revenu et le reseau.
          </p>
        </div>
      </div>

      <div className="mt-5">
        {!isPremium ? (
          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-500/20 dark:bg-orange-500/10">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-orange-700 shadow-sm dark:bg-slate-900 dark:text-orange-300">
                  <Lock className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">🔒 Disponible en Premium</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Debloquez des recommandations pour arbitrer vos routes, vos agences et vos revenus.
                  </p>
                </div>
              </div>
              <Link
                to={`/compagnie/${companyId}/parametres/plan`}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-500"
              >
                Passer en Premium
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Chargement des recommandations...
          </div>
        ) : recommendations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Pas encore assez de signal pour proposer des recommandations.
          </div>
        ) : (
          <div className="space-y-3">
            {recommendations.map((recommendation) => (
              <article
                key={recommendation.id}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/60"
              >
                <p className="font-semibold text-slate-950 dark:text-white">{recommendation.title}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{recommendation.detail}</p>
                <ImpactBadge impact={recommendation.impact} currency={currency} />
                <div className="mt-4">
                  <Link
                    to={recommendation.actionHref}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    {recommendation.actionLabel}
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AgencyTable({
  title,
  rows,
  currency,
  icon,
  loading,
}: {
  title: string;
  rows: CeoAgencyInsight[];
  currency: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {icon}
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">Revenu, operations et dynamique</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Chargement des agences...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Pas encore de donnees sur cette periode.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.agencyId}
              className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-700"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{row.agencyName}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {row.operations.toLocaleString("fr-FR")} operations · {row.reservations.toLocaleString("fr-FR")} billets ·{" "}
                    {row.parcels.toLocaleString("fr-FR")} colis
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold text-slate-950 dark:text-white">
                    {formatCurrency(row.revenue, currency)}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-sm",
                      row.growth >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-orange-600 dark:text-orange-300"
                    )}
                  >
                    {formatGrowth(row.growth)} vs periode precedente
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${Math.max(6, Math.round(row.share * 100))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function AgenciesPerformance({
  topAgencies,
  weakAgencies,
  currency,
  loading,
}: {
  topAgencies: CeoAgencyInsight[];
  weakAgencies: CeoAgencyInsight[];
  currency: string;
  loading: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <AgencyTable
        title="Agences leaders"
        rows={topAgencies}
        currency={currency}
        icon={<TrendingUp className="h-5 w-5" />}
        loading={loading}
      />
      <AgencyTable
        title="Agences a relancer"
        rows={weakAgencies}
        currency={currency}
        icon={<TrendingDown className="h-5 w-5" />}
        loading={loading}
      />
    </section>
  );
}

function RouteTable({
  title,
  rows,
  currency,
  tone,
  loading,
}: {
  title: string;
  rows: CeoRouteInsight[];
  currency: string;
  tone: "positive" | "neutral";
  loading: boolean;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <RouteIcon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Lecture rapide des routes a pousser ou a corriger
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Chargement des routes...
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Pas encore de donnees routes sur cette periode.
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.routeKey}
              className="rounded-xl border border-slate-200 px-4 py-4 dark:border-slate-700"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950 dark:text-white">{row.routeLabel}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {row.operations.toLocaleString("fr-FR")} operations · {row.trips.toLocaleString("fr-FR")} departs suivis
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold text-slate-950 dark:text-white">
                    {formatCurrency(row.revenue, currency)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Remplissage {percentage(row.fillRate)}
                  </p>
                  {tone === "neutral" && row.estimatedImpact > 0 ? (
                    <ImpactBadge
                      impact={row.estimatedImpact}
                      currency={currency}
                      label="Perte estimee"
                    />
                  ) : null}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "positive" ? "bg-emerald-500" : "bg-orange-500"
                  )}
                  style={{
                    width: `${Math.max(8, Math.round((row.fillRate ?? 0.08) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function RoutesAnalysis({
  topRoutes,
  weakRoutes,
  currency,
  loading,
}: {
  topRoutes: CeoRouteInsight[];
  weakRoutes: CeoRouteInsight[];
  currency: string;
  loading: boolean;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <RouteTable
        title="Routes les plus performantes"
        rows={topRoutes}
        currency={currency}
        tone="positive"
        loading={loading}
      />
      <RouteTable
        title="Routes a corriger"
        rows={weakRoutes}
        currency={currency}
        tone="neutral"
        loading={loading}
      />
    </section>
  );
}

export default function CEOCockpitPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const [period, setPeriod] = React.useState<CeoInsightsPeriod>("7d");
  const { company, plan, loading: planLoading } = useCompanyPlan(companyId);
  const insights = useCeoInsights(companyId, period);

  const currency = String(company?.devise ?? company?.currency ?? "XOF");
  const loading = planLoading || insights.loading;

  if (!companyId) {
    return (
      <StandardLayoutWrapper noVerticalPadding className="!py-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          Compagnie introuvable.
        </div>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper noVerticalPadding className="!py-4">
      <div className="space-y-4">
        <CeoHeader plan={plan} period={period} onPeriodChange={setPeriod} />

        <HealthSection
          loading={loading}
          revenueToday={insights.revenueToday}
          revenuePeriod={insights.revenuePeriod}
          growth={insights.growth}
          activeAgencies={insights.activeAgencies}
          currency={currency}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <AlertsSection
            alerts={insights.alerts}
            loading={loading}
            isPremium={plan === "premium"}
            companyId={companyId}
            currency={currency}
          />
          <RecommendationsSection
            companyId={companyId}
            isPremium={plan === "premium"}
            loading={loading}
            recommendations={insights.recommendations}
            currency={currency}
          />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Performance agences</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Les meilleurs points d'appui et les zones a redresser.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <AgenciesPerformance
              topAgencies={insights.topAgencies}
              weakAgencies={insights.weakAgencies}
              currency={currency}
              loading={loading}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <BarChart3 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Analyse routes</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ou le reseau performe et ou la capacite est mal utilisee.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <RoutesAnalysis
              topRoutes={insights.topRoutes}
              weakRoutes={insights.weakRoutes}
              currency={currency}
              loading={loading}
            />
          </div>
        </section>
      </div>
    </StandardLayoutWrapper>
  );
}
