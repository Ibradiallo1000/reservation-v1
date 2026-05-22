import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Lock,
  Package,
  Radio,
  Receipt,
  Smartphone,
  Ticket,
  TrendingDown,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ActionButton, PageHeader, StandardLayoutWrapper } from "@/ui";
import ChiefSessionDetailModal from "@/modules/agence/manager/ChiefSessionDetailModal";
import {
  useAgencyActionCockpit,
  type AgencyActionPanel,
  type AgencyActivePostItem,
  type AgencyAlertItem,
  type AgencyLiveActivityMetric,
  type AgencyLiveTripItem,
  type AgencyPendingExpenseItem,
  type AgencyProblemItem,
  type AgencyRecommendation,
  type AgencyTodoItem,
} from "./useAgencyActionCockpit";

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const candidate = value as { toDate?: () => Date; seconds?: number };
  if (typeof candidate.toDate === "function") {
    const date = candidate.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof candidate.seconds === "number") {
    const date = new Date(candidate.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const fallback = new Date(String(value));
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function postStartedAt(post: AgencyActivePostItem): Date | null {
  return (
    toDateOrNull(post.startAt) ??
    toDateOrNull(post.openedAt) ??
    toDateOrNull(post.createdAt)
  );
}

function formatDurationLabel(durationMs: number): string {
  const safeMs = Math.max(0, durationMs);
  const hours = Math.floor(safeMs / 3600000);
  const minutes = Math.floor((safeMs % 3600000) / 60000);
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}`;
  return `${minutes} min`;
}

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

function todoToneClasses(tone: AgencyTodoItem["tone"]) {
  if (tone === "critical") {
    return "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20";
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20";
  }
  return "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
}

function alertToneClasses(tone: AgencyAlertItem["tone"]) {
  if (tone === "critical") {
    return "border-red-200 bg-red-50 text-red-950 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-100";
  }
  return "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100";
}

function tripToneClasses(tone: AgencyLiveTripItem["tone"]) {
  if (tone === "critical") {
    return {
      badge: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200",
      bar: "bg-red-500",
      track: "bg-red-100 dark:bg-red-950/40",
    };
  }
  if (tone === "warning") {
    return {
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200",
      bar: "bg-amber-500",
      track: "bg-amber-100 dark:bg-amber-950/40",
    };
  }
  return {
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200",
    bar: "bg-emerald-500",
    track: "bg-emerald-100 dark:bg-emerald-950/40",
  };
}

function LiveMetricCard({
  title,
  metric,
  accent,
  icon: Icon,
  countLabel,
  insight,
  money,
}: {
  title: string;
  metric: AgencyLiveActivityMetric;
  accent: string;
  icon: typeof Ticket;
  countLabel: string;
  insight?: React.ReactNode;
  money: (value: number) => string;
}) {
  const effectiveCountLabel =
    title === "En ligne"
      ? "billets payés"
      : title === "Total"
        ? "activité vendue"
        : countLabel;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{metric.count}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{effectiveCountLabel}</p>
        </div>
        <div className={`rounded-xl p-3 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Montant en cours</p>
        <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{money(metric.amount)}</p>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{metric.extraLabel}</p>
      </div>
      {insight ? <div className="mt-4">{insight}</div> : null}
    </div>
  );
}

function LiveTripCard({
  trip,
  money,
}: {
  trip: AgencyLiveTripItem;
  money: (value: number) => string;
}) {
  const tone = tripToneClasses(trip.tone);
  const fillPercent = Math.round(trip.fillRate * 100);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{trip.routeLabel}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Départ {trip.departureTime}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tone.badge}`}>
          {fillPercent}%
        </span>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>{trip.reservedSeats} réservées / {trip.capacity}</span>
          <span>{trip.statusLabel}</span>
        </div>
        <div className={`h-2 overflow-hidden rounded-full ${tone.track}`}>
          <div
            className={`h-full rounded-full ${tone.bar}`}
            style={{ width: `${Math.max(4, Math.min(100, fillPercent))}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        {trip.needsValidation ? (
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Validation agence requise
          </span>
        ) : null}
        {trip.isLate ? (
          <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-200">
            Retard détecté
          </span>
        ) : null}
        {trip.fillRate < 0.5 ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            Risque {money(trip.estimatedLoss)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TodoActionCard({
  item,
  onOpen,
}: {
  item: AgencyTodoItem;
  onOpen: (panel: AgencyActionPanel) => void;
}) {
  return (
    <div className={`rounded-2xl border p-5 ${todoToneClasses(item.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{item.count}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-2 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
          {item.id === "departures" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : item.id === "expenses" ? (
            <Receipt className="h-5 w-5" />
          ) : (
            <Radio className="h-5 w-5" />
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{item.detail}</p>
      <div className="mt-4">
        <ActionButton variant={item.tone === "critical" ? "primary" : "secondary"} onClick={() => onOpen(item.id)}>
          {item.actionLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  risk,
  actionLabel,
  onAction,
}: {
  alert: AgencyAlertItem;
  risk?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${alertToneClasses(alert.tone)}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{alert.title}</p>
          <p className="mt-1 text-sm opacity-90">{alert.detail}</p>
          {risk ? (
            <p className="mt-3 text-sm font-medium opacity-95">
              Risque : {risk}
            </p>
          ) : null}
          {actionLabel && onAction ? (
            <div className="mt-3">
              <ActionButton size="sm" variant={alert.tone === "critical" ? "primary" : "secondary"} onClick={onAction}>
                {actionLabel}
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string;
  value: string;
  icon: typeof Wallet;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</p>
        <div className={`rounded-xl p-3 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function ProblemCard({
  problem,
  money,
}: {
  problem: AgencyProblemItem;
  money: (value: number) => string;
}) {
  const fillPercent = Math.round(problem.fillRate * 100);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{problem.routeLabel}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Départ {problem.departureTime}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          {fillPercent}% remplissage
        </span>
      </div>
      <div className="mt-4 rounded-xl bg-red-50 p-4 dark:bg-red-950/20">
        <p className="text-xs uppercase tracking-wide text-red-600 dark:text-red-300">Perte estimée</p>
        <p className="mt-1 text-lg font-semibold text-red-700 dark:text-red-100">{money(problem.estimatedLoss)}</p>
      </div>
    </div>
  );
}

function RecommendationCard({
  recommendation,
  money,
}: {
  recommendation: AgencyRecommendation;
  money: (value: number) => string;
}) {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">{recommendation.title}</p>
          <p className="mt-2 text-sm text-indigo-900/85 dark:text-indigo-100/80">{recommendation.detail}</p>
        </div>
        <TrendingDown className="h-5 w-5 text-indigo-600 dark:text-indigo-200" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Gain estimé</p>
          <p className="mt-1 text-lg font-semibold text-indigo-950 dark:text-indigo-50">{money(recommendation.estimatedGain)}</p>
        </div>
        <Link
          to={recommendation.to}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Voir détails
        </Link>
      </div>
    </div>
  );
}

function ActivityFeedCard({
  items,
}: {
  items: Array<{
    id: string;
    title: string;
    detail: string;
    occurredAt: Date | null;
    tone: "neutral" | "warning";
  }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Derniers événements</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Aucun mouvement récent à afficher.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-slate-800/70">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{item.detail}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    item.tone === "warning"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  }`}
                >
                  {item.occurredAt
                    ? new Intl.DateTimeFormat("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(item.occurredAt)
                    : "Live"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverlayPanel({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-6">
      <div className="max-h-[88vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(88vh-88px)] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

function PendingExpenseCard({
  expense,
  money,
  busy,
  onApprove,
  onReject,
}: {
  expense: AgencyPendingExpenseItem;
  money: (value: number) => string;
  busy: boolean;
  onApprove: (expenseId: string) => void;
  onReject: (expenseId: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{String(expense.description || "Dépense")}</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {String(expense.category || "Opération")} • {expense.supplierName ? expense.supplierName : "Fournisseur non précisé"}
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{money(Number(expense.amount || 0))}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton size="sm" disabled={busy} onClick={() => onApprove(expense.id)}>
          Approuver
        </ActionButton>
        <ActionButton size="sm" variant="secondary" disabled={busy} onClick={() => onReject(expense.id)}>
          Refuser
        </ActionButton>
      </div>
    </div>
  );
}

export default function AgencyActivityDomainPage() {
  const money = useFormatCurrency();
  const { user } = useAuth() as { user?: { companyId?: string; agencyId?: string } | null };
  const {
    loading,
    plan,
    isPremium,
    liveActivity,
    liveTrips,
    todoItems,
    alerts,
    activityFeed,
    summary,
    operations,
    weakTrips,
    recommendations,
    weeklyLeakEstimate,
    departuresToValidate,
    activePosts,
    pendingExpenses,
    validatingTripId,
    processingExpenseId,
    validateDeparture,
    approvePendingExpense,
    rejectPendingExpense,
  } = useAgencyActionCockpit();

  const [openPanel, setOpenPanel] = useState<AgencyActionPanel | null>(null);
  const [detailSession, setDetailSession] = useState<AgencyActivePostItem | null>(null);

  const planLabel = useMemo(() => plan.toUpperCase(), [plan]);
  const guichetPosts = useMemo(
    () => activePosts.filter((post) => post.kind === "guichet"),
    [activePosts]
  );
  const oldestGuichetPost = useMemo(() => {
    return guichetPosts.reduce<AgencyActivePostItem | null>((current, post) => {
      const currentDate = current ? postStartedAt(current) : null;
      const postDate = postStartedAt(post);
      if (!postDate) return current;
      if (!currentDate) return post;
      return postDate.getTime() < currentDate.getTime() ? post : current;
    }, null);
  }, [guichetPosts]);
  const averageGuichetDurationLabel = useMemo(() => {
    if (guichetPosts.length === 0) return "—";
    const now = Date.now();
    const durations = guichetPosts
      .map((post) => {
        const startedAt = postStartedAt(post);
        return startedAt ? Math.max(0, now - startedAt.getTime()) : null;
      })
      .filter((duration): duration is number => duration != null);
    if (durations.length === 0) return "—";
    const average = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
    return formatDurationLabel(average);
  }, [guichetPosts]);
  const hasNoSalesDespiteOpenPost = guichetPosts.length > 0 && liveActivity.guichet.count === 0;
  const longRunningPost = useMemo(() => {
    const now = Date.now();
    return guichetPosts.find((post) => {
      const startedAt = postStartedAt(post);
      return startedAt ? now - startedAt.getTime() >= 8 * 3600000 : false;
    }) ?? null;
  }, [guichetPosts]);
  const tensionPost = longRunningPost ?? oldestGuichetPost;
  const shouldShowTensionSignal = Boolean(tensionPost) && (hasNoSalesDespiteOpenPost || Boolean(longRunningPost));

  const handleValidateDeparture = async (tripId: string) => {
    try {
      await validateDeparture(tripId);
      toast.success("Départ validé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Validation impossible.");
    }
  };

  const handleApproveExpense = async (expenseId: string) => {
    try {
      await approvePendingExpense(expenseId);
      toast.success("Dépense approuvée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approbation impossible.");
    }
  };

  const handleRejectExpense = async (expenseId: string) => {
    const reason = window.prompt("Motif du refus", "Refusé depuis le cockpit agence");
    if (!reason || !reason.trim()) return;
    try {
      await rejectPendingExpense(expenseId, reason.trim());
      toast.success("Dépense refusée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refus impossible.");
    }
  };

  const guichetInsight = guichetPosts.length > 0 ? (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/70">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Contrôle terrain
      </p>
      <div className="mt-2 space-y-1 text-sm text-slate-700 dark:text-slate-200">
        <p>Postes actifs : {guichetPosts.length}</p>
        <p>Durée moyenne : {averageGuichetDurationLabel}</p>
        {liveActivity.guichet.count === 0 ? (
          <p className="font-medium text-amber-700 dark:text-amber-200">⚠️ aucune vente enregistrée</p>
        ) : null}
      </div>
    </div>
  ) : undefined;

  const alertMeta = (alert: AgencyAlertItem) => {
    if (alert.id.startsWith("long-session-")) {
      const postId = alert.id.replace("long-session-", "");
      const post = activePosts.find((item) => item.id === postId);
      return {
        risk: "perte de ventes et désorganisation du poste",
        actionLabel: "Agir",
        onAction: () => {
          if (post) setDetailSession(post);
          else setOpenPanel("posts");
        },
      };
    }
    if (alert.id === "zero-sales") {
      return {
        risk: "inactivité agent, problème tarif ou absence de demande",
        actionLabel: "Vérifier maintenant",
        onAction: () => setOpenPanel("posts"),
      };
    }
    if (alert.id.startsWith("late-trip-")) {
      return {
        risk: "retard opérationnel et passagers bloqués",
        actionLabel: "Traiter le départ",
        onAction: () => setOpenPanel("departures"),
      };
    }
    if (alert.id === "pending-expenses") {
      return {
        risk: "blocage terrain et retard de règlement",
        actionLabel: "Traiter",
        onAction: () => setOpenPanel("expenses"),
      };
    }
    return {};
  };

  const alertCopy = (alert: AgencyAlertItem): AgencyAlertItem => {
    if (alert.id === "zero-sales") {
      return {
        ...alert,
        title: "Aucune vente malgré poste actif",
        detail: "Vérifiez maintenant l'agent, le tarif ou l'absence de demande avant de perdre la matinée.",
      };
    }
    return alert;
  };

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Cockpit agence"
        subtitle="Pilotez l’activité en direct et traitez immédiatement les blocages terrain"
        icon={Activity}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
          Plan {planLabel}
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Temps réel
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
          {operations.departuresToday} départ(s) • {operations.arrivalsExpected} arrivée(s) attendue(s)
        </span>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            {sectionTitle(
              "Activité en direct",
              "Voyez ce qui se vend maintenant, sans attendre la clôture des postes."
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              <LiveMetricCard
                title="Guichet"
                metric={liveActivity.guichet}
                accent="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                icon={Ticket}
                countLabel="billets en cours"
                insight={guichetInsight}
                money={money}
              />
              <LiveMetricCard
                title="En ligne"
                metric={liveActivity.online}
                accent="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
                icon={Smartphone}
                countLabel="réservations confirmées"
                money={money}
              />
              <LiveMetricCard
                title="Total"
                metric={liveActivity.total}
                accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
                icon={Wallet}
                countLabel="envois créés"
                money={money}
              />
            </div>
            {shouldShowTensionSignal && tensionPost ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900/50 dark:bg-red-950/20">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                      Poste actif depuis {tensionPost.durationLabel}
                    </p>
                    <p className="mt-2 text-sm text-red-800/90 dark:text-red-100/90">
                      {hasNoSalesDespiteOpenPost
                        ? "Aucun billet vendu. Vérifiez maintenant l’agent, le tarif ou l’absence de demande."
                        : "Poste ouvert anormalement longtemps. Vérifiez la clôture, la rotation ou un blocage caisse."}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-100">
                        Risque : perte de ventes
                      </span>
                      <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-red-700 dark:bg-red-950/40 dark:text-red-100">
                        Risque : désorganisation
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <ActionButton variant="primary" onClick={() => setDetailSession(tensionPost)}>
                      Voir le poste
                    </ActionButton>
                    <ActionButton variant="secondary" onClick={() => setOpenPanel("posts")}>
                      Vérifier maintenant
                    </ActionButton>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section>
            {sectionTitle(
              "Trajets du jour",
              "Contrôlez immédiatement le remplissage et les départs qui demandent une décision."
            )}
            {liveTrips.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Aucun trajet aujourd'hui</p>
                <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-100/85">
                  Problème potentiel : planning non défini ou agence inactive sur la journée.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to="/agence/planification"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                  >
                    Créer un trajet
                  </Link>
                  <Link
                    to="/agence/planification"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/40"
                  >
                    Voir planning
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {liveTrips.map((trip) => (
                  <LiveTripCard key={trip.id} trip={trip} money={money} />
                ))}
              </div>
            )}
          </section>

          <section>
            {sectionTitle(
              "À faire",
              "Traitez en premier ce qui bloque vos départs, vos validations et vos postes actifs."
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              {todoItems.map((item) => (
                <TodoActionCard key={item.id} item={item} onOpen={setOpenPanel} />
              ))}
            </div>
          </section>

          <section>
            {sectionTitle(
              "Alertes",
              "Les signaux qui demandent une action maintenant, plus les derniers mouvements du terrain."
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                {alerts.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
                    Aucune alerte critique pour le moment.
                  </div>
                ) : (
                  alerts.map((alert) => {
                    const meta = alertMeta(alert);
                    return (
                      <AlertCard
                        key={alert.id}
                        alert={alertCopy(alert)}
                        risk={meta.risk}
                        actionLabel={meta.actionLabel}
                        onAction={meta.onAction}
                      />
                    );
                  })
                )}
              </div>
              <ActivityFeedCard items={activityFeed} />
            </div>
          </section>

          <section>
            {sectionTitle(
              "Résumé du jour",
              "Gardez la main sur les ventes du jour et le cash attendu."
            )}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                title="Ventes guichet"
                value={money(summary.guichetSales)}
                icon={Wallet}
                accent="bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
              />
              <SummaryCard
                title="Ventes online"
                value={money(summary.onlineSales)}
                icon={Smartphone}
                accent="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-200"
              />
              <SummaryCard
                title="Total"
                value={money(summary.totalSales)}
                icon={Receipt}
                accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"
              />
              <SummaryCard
                title="Cash attendu"
                value={money(summary.expectedCash)}
                icon={Activity}
                accent="bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
              />
            </div>
          </section>

          <section>
            {sectionTitle(
              "Problèmes",
              "Repérez les trajets qui consomment votre revenu sans volume suffisant."
            )}
            {weakTrips.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Aucun trajet sous-rempli à corriger dans la fenêtre de décision actuelle.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {weakTrips.map((problem) => (
                  <ProblemCard key={problem.id} problem={problem} money={money} />
                ))}
              </div>
            )}
          </section>

          <section>
            {sectionTitle(
              "Premium",
              "Transformez vos problèmes terrain en décisions d’optimisation."
            )}
            {!isPremium ? (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/30">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-white/80 p-2 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">
                      🔒 Optimisez votre agence avec Premium
                    </p>
                    <p className="mt-2 text-sm text-indigo-900/85 dark:text-indigo-100/80">
                      {weeklyLeakEstimate > 0
                        ? `Vous perdez environ ${money(weeklyLeakEstimate)} / semaine sur des trajets sous-remplis.`
                        : "Données insuffisantes aujourd'hui pour chiffrer une perte fiable."}
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-indigo-900/85 dark:text-indigo-100/80">
                      <p>Passez en Premium pour :</p>
                      <ul className="space-y-1">
                        <li>- analyse multi-jours</li>
                        <li>- détection anomalies</li>
                        <li>- optimisation trajets</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : recommendations.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Aucune recommandation forte pour l’instant. L’activité du jour reste équilibrée.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {recommendations.map((recommendation) => (
                  <RecommendationCard key={recommendation.id} recommendation={recommendation} money={money} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      <OverlayPanel
        open={openPanel === "departures"}
        onClose={() => setOpenPanel(null)}
        title="Départs à valider"
        subtitle="Validez ici les départs du jour sans quitter le cockpit."
      >
        <div className="space-y-4">
          {departuresToValidate.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Aucun départ en attente de validation.
            </div>
          ) : (
            departuresToValidate.map((trip) => (
              <div key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{trip.routeLabel}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Départ {trip.departureTime} • {trip.reservedSeats} / {trip.capacity} places
                    </p>
                  </div>
                  <ActionButton
                    disabled={validatingTripId === trip.tripInstanceId}
                    onClick={() => void handleValidateDeparture(trip.tripInstanceId)}
                  >
                    {validatingTripId === trip.tripInstanceId ? "Validation..." : "Valider maintenant"}
                  </ActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      </OverlayPanel>

      <OverlayPanel
        open={openPanel === "posts"}
        onClose={() => setOpenPanel(null)}
        title="Postes actifs"
        subtitle="Consultez les sessions en cours sans les mélanger avec la validation comptable."
      >
        <div className="space-y-4">
          {activePosts.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Aucun poste actif pour le moment.
            </div>
          ) : (
            activePosts.map((post) => (
              <div key={post.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{post.label}</p>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        {post.kind === "guichet" ? "Guichet" : "Courrier"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {post.count} opération(s) • {money(post.amount)} • {post.durationLabel}
                    </p>
                  </div>
                  <ActionButton variant="secondary" onClick={() => setDetailSession(post)}>
                    <Eye className="h-4 w-4" />
                    Ouvrir
                  </ActionButton>
                </div>
              </div>
            ))
          )}
        </div>
      </OverlayPanel>

      <OverlayPanel
        open={openPanel === "expenses"}
        onClose={() => setOpenPanel(null)}
        title="Dépenses en attente"
        subtitle="Validez rapidement ce qui bloque le terrain."
      >
        <div className="space-y-4">
          {pendingExpenses.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Aucune dépense en attente pour cette agence.
            </div>
          ) : (
            pendingExpenses.map((expense) => (
              <PendingExpenseCard
                key={expense.id}
                expense={expense}
                money={money}
                busy={processingExpenseId === expense.id}
                onApprove={(expenseId) => void handleApproveExpense(expenseId)}
                onReject={(expenseId) => void handleRejectExpense(expenseId)}
              />
            ))
          )}
        </div>
      </OverlayPanel>

      <ChiefSessionDetailModal
        open={Boolean(detailSession)}
        session={detailSession as any}
        companyId={user?.companyId ?? ""}
        agencyId={user?.agencyId ?? ""}
        onClose={() => setDetailSession(null)}
      />
    </StandardLayoutWrapper>
  );
}
