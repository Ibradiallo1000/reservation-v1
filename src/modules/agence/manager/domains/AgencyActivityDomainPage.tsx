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
  TrendingDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ActionButton, StandardLayoutWrapper } from "@/ui";
import {
  CompactKpiCard,
  MiniDonutStat,
  RevenueMiniChart,
} from "@/modules/agence/dashboard/components";
import ChiefSessionDetailModal from "@/modules/agence/manager/ChiefSessionDetailModal";
import {
  useAgencyActionCockpit,
  type AgencyActionPanel,
  type AgencyActivePostItem,
  type AgencyAlertItem,
  type AgencyLiveTripItem,
  type AgencyPendingExpenseItem,
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

function todoIcon(id: AgencyTodoItem["id"]) {
  if (id === "departures") return <CheckCircle2 className="h-4 w-4" />;
  if (id === "expenses") return <Receipt className="h-4 w-4" />;
  return <Radio className="h-4 w-4" />;
}

// ✅ Fonction utilitaire pour vérifier si un départ est confirmé
function isTripConfirmed(trip: AgencyLiveTripItem): boolean {
  return (
    trip.departureConfirmed === true ||
    trip.departureConfirmedAt !== undefined ||
    trip.departedAt !== undefined ||
    trip.confirmedAt !== undefined
  );
}

// ✅ Modale de consultation de départ (lecture seule)
function TripConsultationModal({
  open,
  trip,
  onClose,
  money,
}: {
  open: boolean;
  trip: AgencyLiveTripItem | null;
  onClose: () => void;
  money: (value: number) => string;
}) {
  if (!open || !trip) return null;

  const isConfirmed = isTripConfirmed(trip);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {isConfirmed ? "Départ confirmé" : "Consultation départ"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{trip.routeLabel}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Départ prévu</p>
              <p className="font-semibold text-slate-900 dark:text-white">{trip.departureTime}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Statut</p>
              <p className={`font-semibold ${isConfirmed ? "text-emerald-600 dark:text-emerald-400" : trip.isLate ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                {isConfirmed ? "✅ Confirmé" : trip.isLate ? "⏰ En retard" : "En cours"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Places occupées</p>
              <p className="font-semibold text-slate-900 dark:text-white">{trip.reservedSeats} / {trip.capacity}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Taux de remplissage</p>
              <p className="font-semibold text-slate-900 dark:text-white">{Math.round(trip.fillRate * 100)}%</p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Perte estimée si vide</p>
            <p className="font-semibold text-slate-900 dark:text-white">{money(trip.estimatedLoss)}</p>
          </div>
          <div className="flex justify-end">
            <ActionButton variant="secondary" onClick={onClose}>
              Fermer
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ✅ Modale de consultation de poste
function PostConsultationModal({
  open,
  post,
  onClose,
  money,
}: {
  open: boolean;
  post: AgencyActivePostItem | null;
  onClose: () => void;
  money: (value: number) => string;
}) {
  if (!open || !post) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Poste {post.kind === "guichet" ? "guichet" : "courrier"}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{post.label}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Type</p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {post.kind === "guichet" ? "Guichet" : "Courrier"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Durée</p>
              <p className="font-semibold text-slate-900 dark:text-white">{post.durationLabel}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Montant</p>
              <p className="font-semibold text-slate-900 dark:text-white">{money(post.amount)}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500 dark:text-slate-400">Opérations</p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {post.kind === "guichet" ? post.tickets : post.count}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Agent</p>
            <p className="font-medium text-slate-900 dark:text-white">
              {post.userName || post.agentName || "Non renseigné"}
            </p>
          </div>
          <div className="flex justify-end">
            <ActionButton variant="secondary" onClick={onClose}>
              Fermer
            </ActionButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayPerformancePanel({
  totalSales,
  ticketsSold,
  guichetSales,
  onlineSales,
  guichetCount,
  onlineCount,
  parcelCount,
  parcelSales,
  money,
}: {
  totalSales: number;
  ticketsSold: number;
  guichetSales: number;
  onlineSales: number;
  guichetCount: number;
  onlineCount: number;
  parcelCount: number;
  parcelSales: number;
  money: (value: number) => string;
}) {
  const channelTotal = Math.max(guichetSales + onlineSales + parcelSales, 1);
  const pct = (value: number) => (channelTotal > 0 ? (value / channelTotal) * 100 : 0);

  const chartData = [
    { label: "Guichet", value: guichetSales, color: "#059669" },
    { label: "En ligne", value: onlineSales, color: "#2563EB" },
    { label: "Réserv.", value: guichetSales + onlineSales, color: "#7C3AED" },
    { label: "Courrier", value: parcelSales, color: "#EA580C" },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Performance du jour</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {ticketsSold} billet{ticketsSold !== 1 ? "s" : ""} • répartition par canal
          </p>
        </div>
        <p className="text-lg font-bold text-slate-900 dark:text-white">{money(totalSales)}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniDonutStat
          label="Guichet"
          displayValue={money(guichetSales)}
          subLabel={`${guichetCount} billet${guichetCount !== 1 ? "s" : ""}`}
          percentage={pct(guichetSales)}
          color="#059669"
        />
        <MiniDonutStat
          label="En ligne"
          displayValue={money(onlineSales)}
          subLabel={`${onlineCount} billet${onlineCount !== 1 ? "s" : ""}`}
          percentage={pct(onlineSales)}
          color="#2563EB"
        />
        <MiniDonutStat
          label="Réservations"
          displayValue={String(ticketsSold)}
          subLabel="billets confirmés"
          percentage={pct(guichetSales + onlineSales)}
          color="#7C3AED"
        />
        <MiniDonutStat
          label="Courrier"
          displayValue={String(parcelCount)}
          subLabel={money(parcelSales)}
          percentage={pct(parcelSales)}
          color="#EA580C"
        />
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Recettes par canal
        </p>
        <RevenueMiniChart data={chartData} height={44} />
      </div>
    </div>
  );
}

function ActivityFeedCard({
  items,
  totalCount,
}: {
  items: Array<{
    id: string;
    title: string;
    detail: string;
    occurredAt: Date | null;
    tone: "neutral" | "warning";
  }>;
  totalCount: number;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Activité récente</h2>
        </div>
        {totalCount > items.length ? (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            +{totalCount - items.length} autre{totalCount - items.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Aucun mouvement récent.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-2 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/50"
            >
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  item.tone === "warning" ? "bg-amber-500" : "bg-emerald-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-medium text-slate-900 dark:text-white">{item.title}</p>
                  <span className="shrink-0 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                    {item.occurredAt
                      ? new Intl.DateTimeFormat("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(item.occurredAt)
                      : "Live"}
                  </span>
                </div>
                <p className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompactRecommendationCard({
  recommendation,
  money,
}: {
  recommendation: AgencyRecommendation;
  money: (value: number) => string;
}) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">{recommendation.title}</p>
        <TrendingDown className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-200" />
      </div>
      <p className="mt-1 line-clamp-2 flex-1 text-[11px] text-indigo-900/85 dark:text-indigo-100/80">
        {recommendation.detail}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Gain estimé</p>
          <p className="text-sm font-semibold text-indigo-950 dark:text-indigo-50">
            {money(recommendation.estimatedGain)}
          </p>
        </div>
        <Link
          to={recommendation.to}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-indigo-200 bg-white px-3 text-[11px] font-semibold text-indigo-800 transition-colors hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100 dark:hover:bg-indigo-900/40"
        >
          Voir
        </Link>
      </div>
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
    processingExpenseId,
    approvePendingExpense,
    rejectPendingExpense,
  } = useAgencyActionCockpit();

  const [openPanel, setOpenPanel] = useState<AgencyActionPanel | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<AgencyLiveTripItem | null>(null);
  const [selectedPost, setSelectedPost] = useState<AgencyActivePostItem | null>(null);
  const [detailSession, setDetailSession] = useState<AgencyActivePostItem | null>(null);

  const guichetPosts = useMemo(
    () => activePosts.filter((post) => post.kind === "guichet"),
    [activePosts]
  );
  const courierPosts = useMemo(
    () => activePosts.filter((post) => post.kind === "courrier"),
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
      return startedAt ? now - startedAt.getTime() >= 24 * 3600000 : false;
    }) ?? null;
  }, [guichetPosts]);
  const tensionPost = longRunningPost ?? oldestGuichetPost;
  const shouldShowTensionSignal = Boolean(tensionPost) && (hasNoSalesDespiteOpenPost || Boolean(longRunningPost));
  
  // ✅ Les départs en retard excluent ceux qui sont confirmés
  const lateTrips = useMemo(() => {
    return liveTrips.filter((trip) => {
      const isConfirmed = isTripConfirmed(trip);
      return trip.isLate && !isConfirmed;
    });
  }, [liveTrips]);
  
  const departuresToHandle = useMemo(() => {
    const byId = new Map<string, AgencyLiveTripItem>();
    for (const trip of [...departuresToValidate, ...lateTrips]) byId.set(trip.id, trip);
    return [...byId.values()];
  }, [departuresToValidate, lateTrips]);
  
  const worstFillRate = useMemo(() => {
    if (weakTrips.length === 0) return null;
    return Math.round(Math.min(...weakTrips.map((trip) => trip.fillRate)) * 100);
  }, [weakTrips]);
  const recentActivity = useMemo(() => activityFeed.slice(0, 5), [activityFeed]);

  const showPremiumSection =
    (isPremium && recommendations.length > 0) || (!isPremium && weeklyLeakEstimate > 0);

  const handleApproveExpense = async (expenseId: string) => {
    try {
      await approvePendingExpense(expenseId);
      toast.success("Dépense approuvée.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approbation impossible.");
    }
  };

  const handleRejectExpense = async (expenseId: string) => {
    const reason = window.prompt("Motif du refus", "Refusé depuis le dashboard agence");
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
        actionLabel: "Agir",
        onAction: () => {
          if (post) setDetailSession(post);
          else setOpenPanel("posts");
        },
      };
    }
    if (alert.id === "zero-sales") {
      return {
        actionLabel: "Vérifier",
        onAction: () => setOpenPanel("posts"),
      };
    }
    if (alert.id.startsWith("late-trip-")) {
      return {
        actionLabel: "Consulter",
        onAction: () => {
          const tripId = alert.id.replace("late-trip-", "");
          const trip = liveTrips.find((t) => t.id === tripId);
          if (trip) setSelectedTrip(trip);
        },
      };
    }
    if (alert.id === "pending-expenses") {
      return {
        actionLabel: "Traiter",
        onAction: () => setOpenPanel("expenses"),
      };
    }
    return {};
  };

  return (
    <StandardLayoutWrapper>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard agence</h1>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Ce qui nécessite votre attention aujourd&apos;hui
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
            Temps réel
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
            {operations.departuresToday} départ{operations.departuresToday !== 1 ? "s" : ""}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400">
            {operations.arrivalsExpected} arrivée{operations.arrivalsExpected !== 1 ? "s" : ""} attendue{operations.arrivalsExpected !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Actions requises
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {todoItems.map((item) => (
                <CompactKpiCard
                  key={item.id}
                  title={item.title}
                  value={item.count}
                  subtitle={item.count > 0 ? item.detail : "Rien à traiter"}
                  icon={todoIcon(item.id)}
                  tone={item.tone}
                  actionLabel={item.count > 0 ? item.actionLabel : undefined}
                  onAction={item.count > 0 ? () => {
                    if (item.id === "departures") {
                      // ✅ Ouverture directe des départs en consultation
                      const trip = departuresToHandle[0];
                      if (trip) setSelectedTrip(trip);
                    } else {
                      setOpenPanel(item.id);
                    }
                  } : undefined}
                />
              ))}
              <CompactKpiCard
                title="Départs en retard"
                value={lateTrips.length}
                subtitle={lateTrips.length > 0 ? "Retards opérationnels détectés" : "Aucun retard"}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={lateTrips.length > 0 ? "critical" : "neutral"}
                badge={lateTrips.length > 0 ? "Urgent" : undefined}
                actionLabel={lateTrips.length > 0 ? "Consulter" : undefined}
                onAction={lateTrips.length > 0 ? () => {
                  const trip = lateTrips[0];
                  if (trip) setSelectedTrip(trip);
                } : undefined}
              />
            </div>

            {shouldShowTensionSignal && tensionPost ? (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/50 dark:bg-red-950/20 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-red-900 dark:text-red-100">
                    Poste actif depuis {tensionPost.durationLabel}
                  </p>
                  <p className="text-[11px] text-red-800/90 dark:text-red-100/90">
                    {hasNoSalesDespiteOpenPost
                      ? "Aucune vente — vérifiez l'agent ou le tarif."
                      : "Poste ouvert longtemps — vérifiez la rotation."}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailSession(tensionPost)}
                    className="text-[11px] font-semibold text-red-800 underline-offset-2 hover:underline dark:text-red-200"
                  >
                    Voir le poste
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <DayPerformancePanel
                totalSales={summary.totalSales}
                ticketsSold={liveActivity.total.count}
                guichetSales={summary.guichetSales}
                onlineSales={summary.onlineSales}
                guichetCount={liveActivity.guichet.count}
                onlineCount={liveActivity.online.count}
                parcelCount={liveActivity.parcels.count}
                parcelSales={liveActivity.parcels.amount}
                money={money}
              />
            </div>
            <div className="lg:col-span-2">
              <ActivityFeedCard items={recentActivity} totalCount={activityFeed.length} />
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Analyse et problèmes
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <CompactKpiCard
                title="Retard départ"
                value={lateTrips.length}
                subtitle={lateTrips.length > 0 ? "Départs à surveiller" : "Aucun retard"}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={lateTrips.length > 0 ? "critical" : "success"}
                badge={lateTrips.length > 0 ? "Risque élevé" : "OK"}
                actionLabel={lateTrips.length > 0 ? "Consulter" : undefined}
                onAction={lateTrips.length > 0 ? () => {
                  const trip = lateTrips[0];
                  if (trip) setSelectedTrip(trip);
                } : undefined}
              />
              <CompactKpiCard
                title="Remplissage"
                value={weakTrips.length}
                subtitle={
                  worstFillRate !== null
                    ? `Plus faible : ${worstFillRate}%`
                    : "Aucun trajet sous-rempli"
                }
                icon={<TrendingDown className="h-4 w-4" />}
                tone={weakTrips.length > 0 ? "warning" : "success"}
                badge={weakTrips.length > 0 ? "À surveiller" : "OK"}
              />
              <CompactKpiCard
                title="Dépenses en attente"
                value={pendingExpenses.length}
                subtitle={pendingExpenses.length > 0 ? "Validation requise" : "Aucune en attente"}
                icon={<Receipt className="h-4 w-4" />}
                tone={pendingExpenses.length > 0 ? "warning" : "neutral"}
                actionLabel={pendingExpenses.length > 0 ? "Traiter" : undefined}
                onAction={pendingExpenses.length > 0 ? () => setOpenPanel("expenses") : undefined}
              />
              <CompactKpiCard
                title="Départs à valider"
                value={departuresToValidate.length}
                subtitle={departuresToValidate.length > 0 ? "En attente de validation" : "Tous validés"}
                icon={<CheckCircle2 className="h-4 w-4" />}
                tone={departuresToValidate.length > 0 ? "critical" : "success"}
                actionLabel={departuresToValidate.length > 0 ? "Consulter" : undefined}
                onAction={departuresToValidate.length > 0 ? () => {
                  const trip = departuresToValidate[0];
                  if (trip) setSelectedTrip(trip);
                } : undefined}
              />
              <CompactKpiCard
                title="Courriers en attente"
                value={courierPosts.length}
                subtitle={
                  courierPosts.length > 0
                    ? `${liveActivity.parcels.count} envoi${liveActivity.parcels.count !== 1 ? "s" : ""} du jour`
                    : "Aucun poste courrier actif"
                }
                icon={<Package className="h-4 w-4" />}
                tone={courierPosts.length > 0 ? "warning" : "neutral"}
                actionLabel={courierPosts.length > 0 ? "Voir postes" : undefined}
                onAction={courierPosts.length > 0 ? () => setOpenPanel("posts") : undefined}
              />
            </div>

            {alerts.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {alerts.slice(0, 3).map((alert) => {
                  const meta = alertMeta(alert);
                  return (
                    <CompactKpiCard
                      key={alert.id}
                      title={alert.title.replace(/^[^\w]+/, "").trim()}
                      subtitle={alert.detail}
                      icon={<AlertTriangle className="h-4 w-4" />}
                      tone={alert.tone === "critical" ? "critical" : "warning"}
                      badge={alert.tone === "critical" ? "Alerte" : "Signal"}
                      actionLabel={meta.actionLabel}
                      onAction={meta.onAction}
                    />
                  );
                })}
              </div>
            ) : null}
          </section>

          {showPremiumSection ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recommandations
              </h2>
              {!isPremium ? (
                <div className="flex flex-col gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <div className="rounded-lg bg-white/80 p-1.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100">
                      <Lock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-indigo-950 dark:text-indigo-100">
                        Optimisez avec Premium
                      </p>
                      <p className="mt-0.5 text-[11px] text-indigo-900/85 dark:text-indigo-100/80">
                        Perte estimée : {money(weeklyLeakEstimate)} / semaine sur trajets sous-remplis.
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/agence/planification"
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-white px-3 text-[11px] font-semibold text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"
                  >
                    En savoir plus
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {recommendations.map((recommendation) => (
                    <CompactRecommendationCard
                      key={recommendation.id}
                      recommendation={recommendation}
                      money={money}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {liveTrips.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Aucun trajet aujourd&apos;hui</p>
              <p className="text-[11px] text-amber-800/90 dark:text-amber-100/85">
                Vérifiez le planning si l&apos;agence devrait être active.
              </p>
              <Link
                to="/agence/planification"
                className="mt-1 inline-block text-[11px] font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
              >
                Voir le planning
              </Link>
            </div>
          ) : null}
        </div>
      )}

      <OverlayPanel
        open={openPanel === "departures"}
        onClose={() => setOpenPanel(null)}
        title="Départs à surveiller"
        subtitle="Consultez les départs en attente ou en retard."
      >
        <div className="space-y-4">
          {departuresToHandle.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
              Aucun départ à surveiller.
            </div>
          ) : (
            departuresToHandle.map((trip) => {
              const isConfirmed = isTripConfirmed(trip);
              
              return (
                <div key={trip.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{trip.routeLabel}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Départ {trip.departureTime} • {trip.reservedSeats} / {trip.capacity} places
                      </p>
                      <p className={`mt-2 text-xs font-semibold ${isConfirmed ? "text-emerald-600 dark:text-emerald-400" : trip.isLate ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                        {isConfirmed ? "✅ Départ confirmé" : trip.isLate ? "⏰ Départ en retard" : "Validation agence requise"}
                      </p>
                    </div>
                    <ActionButton 
                      variant="secondary" 
                      onClick={() => setSelectedTrip(trip)}
                    >
                      <Eye className="h-4 w-4" />
                      Consulter
                    </ActionButton>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </OverlayPanel>

      <OverlayPanel
        open={openPanel === "posts"}
        onClose={() => setOpenPanel(null)}
        title="Postes actifs"
        subtitle="Sessions en cours — cliquez pour consulter."
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
                  <ActionButton variant="secondary" onClick={() => setSelectedPost(post)}>
                    <Eye className="h-4 w-4" />
                    Consulter
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

      {/* ✅ Modale de consultation de départ (lecture seule) */}
      <TripConsultationModal
        open={Boolean(selectedTrip)}
        trip={selectedTrip}
        onClose={() => setSelectedTrip(null)}
        money={money}
      />

      {/* ✅ Modale de consultation de poste */}
      <PostConsultationModal
        open={Boolean(selectedPost)}
        post={selectedPost}
        onClose={() => setSelectedPost(null)}
        money={money}
      />

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