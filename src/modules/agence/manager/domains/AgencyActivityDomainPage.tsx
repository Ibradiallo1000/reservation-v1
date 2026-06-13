import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Lock,
  Radio,
  Receipt,
  TrendingDown,
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

function LiveTripCard({
  trip,
  money,
  onOpen,
}: {
  trip: AgencyLiveTripItem;
  money: (value: number) => string;
  onOpen: () => void;
}) {
  const tone = tripToneClasses(trip.tone);
  const fillPercent = Math.round(trip.fillRate * 100);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
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
      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
      >
        Voir le départ
      </button>
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
    <div className={`rounded-2xl border p-4 ${todoToneClasses(item.tone)}`}>
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
      <div className="mt-4">
        <ActionButton className="w-full sm:w-auto" variant={item.tone === "critical" ? "primary" : "secondary"} onClick={() => onOpen(item.id)}>
          {item.actionLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function LateDeparturesActionCard({
  count,
  onOpen,
}: {
  count: number;
  onOpen: () => void;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${count > 0 ? todoToneClasses("critical") : todoToneClasses("neutral")}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Départs en retard</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">{count}</p>
        </div>
        <div className="rounded-xl bg-white/80 p-2 text-red-700 dark:bg-slate-900/70 dark:text-red-200">
          <AlertTriangle className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4">
        <ActionButton className="w-full sm:w-auto" variant={count > 0 ? "primary" : "secondary"} onClick={onOpen}>
          Traiter maintenant
        </ActionButton>
      </div>
    </div>
  );
}

function DayPerformanceCard({
  totalSales,
  ticketsSold,
  guichetSales,
  onlineSales,
  money,
}: {
  totalSales: number;
  ticketsSold: number;
  guichetSales: number;
  onlineSales: number;
  money: (value: number) => string;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-sm dark:border-emerald-900">
      <div className="p-5 sm:p-7">
        <p className="text-sm font-semibold text-emerald-50">Ventes du jour</p>
        <p className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-5xl">{money(totalSales)}</p>
        <p className="mt-3 text-sm font-medium text-emerald-50">{ticketsSold} billets vendus</p>
      </div>
      <div className="grid grid-cols-1 gap-px bg-white/20 sm:grid-cols-2">
        <div className="bg-emerald-800/35 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">Guichet</p>
          <p className="mt-1 text-lg font-semibold">{money(guichetSales)}</p>
        </div>
        <div className="bg-emerald-800/35 px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">En ligne</p>
          <p className="mt-1 text-lg font-semibold">{money(onlineSales)}</p>
        </div>
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
      <div className="flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        <p className="text-sm font-semibold text-slate-900 dark:text-white">Activité récente</p>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Aucun mouvement récent à afficher.</p>
      ) : (
        <div className="relative mt-4 space-y-0 before:absolute before:bottom-3 before:left-[2.15rem] before:top-3 before:w-px before:bg-slate-200 dark:before:bg-slate-700">
          {items.map((item) => (
            <div key={item.id} className="relative flex gap-4 py-3">
              <span className="w-12 shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {item.occurredAt
                  ? new Intl.DateTimeFormat("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(item.occurredAt)
                  : "Live"}
              </span>
              <span className={`relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                item.tone === "warning" ? "bg-amber-500" : "bg-emerald-500"
              }`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">{item.title}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
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
  const lateTrips = useMemo(() => liveTrips.filter((trip) => trip.isLate), [liveTrips]);
  const departuresToHandle = useMemo(() => {
    const byId = new Map<string, AgencyLiveTripItem>();
    for (const trip of [...departuresToValidate, ...lateTrips]) byId.set(trip.id, trip);
    return [...byId.values()];
  }, [departuresToValidate, lateTrips]);

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
        <div className="space-y-10">
          <section>
            {sectionTitle(
              "Actions requises",
              "Commencez par les décisions qui bloquent l’activité de l’agence."
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {todoItems.map((item) => (
                <TodoActionCard key={item.id} item={item} onOpen={setOpenPanel} />
              ))}
              <LateDeparturesActionCard count={lateTrips.length} onOpen={() => setOpenPanel("departures")} />
            </div>
            {shouldShowTensionSignal && tensionPost ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/20 sm:p-5">
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
                  <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
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
            {alerts.length > 0 ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {alerts.slice(0, 2).map((alert) => {
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
                })}
              </div>
            ) : null}
          </section>

          <section>
            {sectionTitle(
              "Performance du jour",
              "Le niveau de ventes actuel, avec la répartition guichet et en ligne."
            )}
            <DayPerformanceCard
              totalSales={summary.totalSales}
              ticketsSold={liveActivity.total.count}
              guichetSales={summary.guichetSales}
              onlineSales={summary.onlineSales}
              money={money}
            />
          </section>

          <section>
            {sectionTitle(
              "Départs du jour",
              "Repérez rapidement le remplissage, les retards et les départs à valider."
            )}
            {liveTrips.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20 sm:p-5">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">Aucun trajet aujourd'hui</p>
                <p className="mt-2 text-sm text-amber-800/90 dark:text-amber-100/85">
                  Problème potentiel : planning non défini ou agence inactive sur la journée.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                  <Link
                    to="/agence/planification"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-medium text-white transition-colors hover:bg-amber-700"
                  >
                    Créer un trajet
                  </Link>
                  <Link
                    to="/agence/planification"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-900/40"
                  >
                    Voir planning
                  </Link>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {liveTrips.map((trip) => (
                  <LiveTripCard key={trip.id} trip={trip} money={money} onOpen={() => setOpenPanel("departures")} />
                ))}
              </div>
            )}
          </section>

          <section>
            {sectionTitle(
              "Activité récente",
              "Les derniers mouvements utiles pour comprendre ce qui vient de se passer."
            )}
            <ActivityFeedCard items={activityFeed} />
          </section>

          <section>
            {sectionTitle(
              "Analyse et problèmes",
              "Les risques de remplissage et signaux opérationnels à surveiller après les actions urgentes."
            )}
            {weakTrips.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-100">
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
              "Optimisez les décisions après avoir traité les opérations du jour."
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
        title="Départs à traiter"
        subtitle="Validez les départs requis et traitez les départs en retard sans quitter le cockpit."
      >
        <div className="space-y-4">
          {departuresToHandle.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Aucun départ à traiter.
            </div>
          ) : (
            departuresToHandle.map((trip) => (
              <div key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{trip.routeLabel}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Départ {trip.departureTime} • {trip.reservedSeats} / {trip.capacity} places
                    </p>
                    <p className={`mt-2 text-xs font-semibold ${trip.isLate ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                      {trip.isLate ? "Départ en retard" : "Validation agence requise"}
                    </p>
                  </div>
                  <ActionButton
                    disabled={validatingTripId === trip.tripInstanceId}
                    onClick={() => void handleValidateDeparture(trip.tripInstanceId)}
                  >
                    {validatingTripId === trip.tripInstanceId
                      ? "Validation..."
                      : trip.isLate
                        ? "Confirmer le départ"
                        : "Valider maintenant"}
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
                      {post.kind === "guichet"
                        ? `${post.tickets} billet${post.tickets !== 1 ? "s" : ""}`
                        : `${post.count} opération${post.count !== 1 ? "s" : ""}`}{" "}
                      • {money(post.amount)} • {post.durationLabel}
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
