import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyPlan } from "@/core/hooks/useCompanyPlan";
import { normalizeReservation } from "@/lib/normalizeReservation";
import {
  getEndOfDayForDate,
  getStartOfDayForDate,
  getTodayForTimezone,
  resolveAgencyTimezone,
} from "@/shared/date/dateUtilsTz";
import {
  belongsToGuichetSession,
  isOnlinePaymentChannel,
} from "@/modules/agence/guichet/guichetSessionReservationModel";
import { approveExpense, listExpenses, rejectExpense, type ExpenseDoc } from "@/modules/compagnie/treasury/expenses";
import {
  tripInstanceArrival,
  tripInstanceDeparture,
  tripInstanceSeatCapacity,
  tripInstanceTime,
  type TripInstanceDocWithId,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { markOriginDeparture } from "@/modules/compagnie/tripInstances/tripProgressService";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";

dayjs.extend(utc);
dayjs.extend(timezone);

const LONG_SESSION_THRESHOLD_MS = 8 * 60 * 60 * 1000;
const DEPARTURE_LATE_THRESHOLD_MINUTES = 15;
const WEAK_FILL_RATE_THRESHOLD = 0.5;

export type AgencyTodoTone = "critical" | "warning" | "neutral";
export type AgencyAlertTone = "critical" | "warning";
export type AgencyTripTone = "critical" | "warning" | "healthy";
export type AgencyActionPanel = "departures" | "posts" | "expenses";

type SessionDoc = {
  id: string;
  kind: "guichet" | "courrier";
  type: string;
  status: string;
  userId?: string;
  userName?: string | null;
  userCode?: string | null;
  agentName?: string | null;
  agentCode?: string | null;
  startAt?: unknown;
  openedAt?: unknown;
  createdAt?: unknown;
  closedAt?: unknown;
};

type ReservationRow = {
  id: string;
  raw: Record<string, unknown>;
  normalized: ReturnType<typeof normalizeReservation>;
  amount: number;
  seats: number;
  createdAt: Date | null;
  confirmed: boolean;
  cancelled: boolean;
  online: boolean;
  onlinePaid: boolean;
  sold: boolean;
  tripInstanceId: string;
};

type ShipmentRow = {
  id: string;
  originAgencyId?: string;
  destinationAgencyId?: string;
  currentStatus?: string;
  tripInstanceId?: string | null;
  sessionId?: string;
  nature?: string;
  transportFee?: number;
  insuranceAmount?: number;
  createdAt?: unknown;
};

type TripReservationAggregate = {
  reservations: number;
  reservedSeats: number;
  revenue: number;
};

export type AgencyLiveActivityMetric = {
  count: number;
  amount: number;
  extraLabel: string;
};

export type AgencyTodoItem = {
  id: AgencyActionPanel;
  title: string;
  count: number;
  detail: string;
  tone: AgencyTodoTone;
  actionLabel: string;
};

export type AgencyAlertItem = {
  id: string;
  title: string;
  detail: string;
  tone: AgencyAlertTone;
};

export type AgencyLiveTripItem = {
  id: string;
  tripInstanceId: string;
  routeLabel: string;
  departureTime: string;
  reservedSeats: number;
  capacity: number;
  fillRate: number;
  tone: AgencyTripTone;
  needsValidation: boolean;
  isLate: boolean;
  statusLabel: string;
  estimatedLoss: number;
};

export type AgencyProblemItem = {
  id: string;
  tripInstanceId: string;
  routeLabel: string;
  departureTime: string;
  fillRate: number;
  estimatedLoss: number;
};

export type AgencyRecommendation = {
  id: string;
  title: string;
  detail: string;
  estimatedGain: number;
  to: string;
};

export type AgencyActivityFeedItem = {
  id: string;
  kind: "ticket" | "parcel" | "departure" | "delay";
  title: string;
  detail: string;
  occurredAt: Date | null;
  tone: "neutral" | "warning";
};

export type AgencyActivePostItem = {
  id: string;
  kind: "guichet" | "courrier";
  type: string;
  status: string;
  userId?: string;
  userName?: string | null;
  userCode?: string | null;
  agentName?: string | null;
  agentCode?: string | null;
  startAt?: unknown;
  openedAt?: unknown;
  createdAt?: unknown;
  closedAt?: unknown;
  label: string;
  count: number;
  amount: number;
  tickets: number;
  durationLabel: string;
};

export type AgencyPendingExpenseItem = ExpenseDoc & {
  id: string;
};

type RawLiveSources = {
  activeGuichetSessions: SessionDoc[];
  activeCourierSessions: SessionDoc[];
  reservationRows: ReservationRow[];
  shipmentsToday: Array<ShipmentRow & { amount: number; createdDate: Date | null }>;
  now: Date;
};

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

function formatClock(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(from: Date | null, now: Date): string {
  if (!from) return "Durée inconnue";
  const diffMs = Math.max(0, now.getTime() - from.getTime());
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isReservationCancelled(normalizedStatus: string): boolean {
  return ["annule", "annulé", "annulation_en_attente", "invalide", "cancelled", "canceled"].includes(normalizedStatus);
}

function isReservationConfirmedStatus(normalizedStatus: string): boolean {
  return ["confirme", "confirmé", "paye", "payé", "valide", "validé", "paid"].includes(normalizedStatus);
}

function isSessionOpen(status: string): boolean {
  const normalized = normalizeText(status);
  return normalized === "active" || normalized === "paused";
}

function isCourierSessionOpen(status: string): boolean {
  return String(status ?? "").toUpperCase() === "ACTIVE";
}

function tripScheduledAt(dateKey: string, departureTime: string, agencyTimezone: string): Date | null {
  const trimmedTime = departureTime.trim();
  if (!dateKey || !trimmedTime) return null;
  const parsed = dayjs.tz(`${dateKey} ${trimmedTime}`, "YYYY-MM-DD HH:mm", agencyTimezone);
  return parsed.isValid() ? parsed.toDate() : null;
}

function tripHasDeparted(trip: TripInstanceDocWithId): boolean {
  const status = normalizeText(trip.status);
  const statutMetier = normalizeText(trip.statutMetier);
  return (
    status === "departed" ||
    status === "arrived" ||
    statutMetier === "en_transit" ||
    statutMetier === "retour_origine" ||
    statutMetier === "termine"
  );
}

function tripHasArrived(trip: TripInstanceDocWithId): boolean {
  const status = normalizeText(trip.status);
  const statutMetier = normalizeText(trip.statutMetier);
  return status === "arrived" || statutMetier === "termine" || toDateOrNull(trip.arrivalValidatedAt) != null;
}

function expenseLabel(expense: AgencyPendingExpenseItem): string {
  return String(expense.description ?? "").trim() || "Dépense en attente";
}

function getLiveActivity(sources: RawLiveSources): {
  guichet: AgencyLiveActivityMetric;
  online: AgencyLiveActivityMetric;
  parcels: AgencyLiveActivityMetric;
  activePosts: AgencyActivePostItem[];
} {
  const activePosts: AgencyActivePostItem[] = [];

  let guichetTickets = 0;
  let guichetAmount = 0;

  // ✅ APPROCHE ROBUSTE: Guichet = toutes les ventes non-online
  const guichetRows = sources.reservationRows.filter((reservation) => !reservation.online);
  
  for (const session of sources.activeGuichetSessions) {
    // Utilisation de guichetRows comme base
    const relatedRows = guichetRows;
    
    const reservationsCount = relatedRows.length;
    const ticketsCount = relatedRows.reduce((sum, reservation) => sum + reservation.seats, 0);
    const sessionAmount = relatedRows.reduce((sum, reservation) => sum + reservation.amount, 0);

    guichetTickets += ticketsCount;
    guichetAmount += sessionAmount;

    const startedAt =
      toDateOrNull(session.startAt) ??
      toDateOrNull(session.openedAt) ??
      toDateOrNull(session.createdAt);

    activePosts.push({
      ...session,
      label:
        String(session.userName ?? "").trim() ||
        String(session.agentName ?? "").trim() ||
        "Poste guichet",
      count: reservationsCount,
      amount: sessionAmount,
      tickets: ticketsCount,
      durationLabel: formatDuration(startedAt, sources.now),
    });
  }

  let courierCount = 0;
  let courierAmount = 0;
  for (const session of sources.activeCourierSessions) {
    const sessionShipments = sources.shipmentsToday.filter((shipment) => String(shipment.sessionId ?? "") === session.id);
    const sessionAmount = sessionShipments.reduce((sum, shipment) => sum + shipment.amount, 0);
    courierCount += sessionShipments.length;
    courierAmount += sessionAmount;

    const startedAt =
      toDateOrNull(session.startAt) ??
      toDateOrNull(session.openedAt) ??
      toDateOrNull(session.createdAt);

    activePosts.push({
      ...session,
      label:
        String(session.agentName ?? "").trim() ||
        String(session.userName ?? "").trim() ||
        "Poste courrier",
      count: sessionShipments.length,
      amount: sessionAmount,
      tickets: 0,
      durationLabel: formatDuration(startedAt, sources.now),
    });
  }

  // ✅ APPROCHE ROBUSTE: Online = validée OU payée (fallback)
  const onlineRows = sources.reservationRows.filter(
    (reservation) => reservation.online && (reservation.confirmed || reservation.onlinePaid)
  );
  const onlineTickets = onlineRows.reduce((sum, reservation) => sum + reservation.seats, 0);
  const onlineAmount = onlineRows.reduce((sum, reservation) => sum + reservation.amount, 0);
  const parcelsAmount = sources.shipmentsToday.reduce((sum, shipment) => sum + shipment.amount, 0);

  activePosts.sort((left, right) => {
    const leftDate = toDateOrNull(left.startAt) ?? toDateOrNull(left.openedAt) ?? toDateOrNull(left.createdAt);
    const rightDate = toDateOrNull(right.startAt) ?? toDateOrNull(right.openedAt) ?? toDateOrNull(right.createdAt);
    return (rightDate?.getTime() ?? 0) - (leftDate?.getTime() ?? 0);
  });

  return {
    guichet: {
      count: guichetTickets,
      amount: guichetAmount,
      extraLabel: `${sources.activeGuichetSessions.length} poste(s) actif(s)`,
    },
    online: {
      count: onlineTickets,
      amount: onlineAmount,
      extraLabel: "Réservations validées/payées",
    },
    parcels: {
      count: sources.shipmentsToday.length,
      amount: parcelsAmount,
      extraLabel: `${courierCount} envois rattachés à un poste actif`,
    },
    activePosts,
  };
}

function getSessionDrivenLiveActivity(sources: RawLiveSources): {
  guichet: AgencyLiveActivityMetric;
  online: AgencyLiveActivityMetric;
  total: AgencyLiveActivityMetric;
  parcels: AgencyLiveActivityMetric;
  activePosts: AgencyActivePostItem[];
} {
  const base = getLiveActivity(sources);
  
  // ✅ APPROCHE ROBUSTE: Online = validée OU payée
  const onlineSoldRows = sources.reservationRows.filter(
    (reservation) => reservation.online && (reservation.confirmed || reservation.onlinePaid)
  );
  const onlineTickets = onlineSoldRows.reduce((sum, reservation) => sum + reservation.seats, 0);
  const onlineAmount = onlineSoldRows.reduce((sum, reservation) => sum + reservation.amount, 0);
  const totalTickets = base.guichet.count + onlineTickets;
  const totalAmount = base.guichet.amount + onlineAmount;

  return {
    ...base,
    online: {
      count: onlineTickets,
      amount: onlineAmount,
      extraLabel: `${onlineSoldRows.length} vente(s) confirmées`,
    },
    total: {
      count: totalTickets,
      amount: totalAmount,
      extraLabel: "Guichet + en ligne",
    },
  };
}

function getTripReservationAggregates(reservationRows: ReservationRow[]): Map<string, TripReservationAggregate> {
  const perTrip = new Map<string, TripReservationAggregate>();
  for (const reservation of reservationRows) {
    // ✅ On inclut toutes les réservations (cancelled ou non)
    if (!reservation.tripInstanceId || reservation.tripInstanceId === "") continue;
    const current = perTrip.get(reservation.tripInstanceId) ?? {
      reservations: 0,
      reservedSeats: 0,
      revenue: 0,
    };
    current.reservations += 1;
    current.reservedSeats += reservation.seats;
    current.revenue += reservation.amount;
    perTrip.set(reservation.tripInstanceId, current);
  }
  return perTrip;
}

function getTripsAnalysis(params: {
  tripsToday: TripInstanceDocWithId[];
  destinationTripsToday: TripInstanceDocWithId[];
  reservationAggregates: Map<string, TripReservationAggregate>;
  averageTicketPrice: number;
  agencyTimezone: string;
  now: Date;
}): {
  liveTrips: AgencyLiveTripItem[];
  weakTrips: AgencyProblemItem[];
  departuresToValidate: AgencyLiveTripItem[];
  operations: { departuresToday: number; arrivalsExpected: number };
  weeklyLeakEstimate: number;
} {
  const liveTrips = params.tripsToday
    .map<AgencyLiveTripItem>((trip) => {
      const capacity = Math.max(1, tripInstanceSeatCapacity(trip) || 50);
      const reservationAggregate = params.reservationAggregates.get(trip.id) ?? {
        reservations: 0,
        reservedSeats: 0,
        revenue: 0,
      };
      const fillRate = Math.max(0, Math.min(1, reservationAggregate.reservedSeats / capacity));
      const scheduledAt = tripScheduledAt(trip.date, tripInstanceTime(trip), params.agencyTimezone);
      const isLate =
        scheduledAt != null &&
        scheduledAt.getTime() < params.now.getTime() - DEPARTURE_LATE_THRESHOLD_MINUTES * 60000 &&
        !tripHasDeparted(trip);
      const needsValidation = normalizeText(trip.statutMetier) === "validation_agence_requise";
      const tone: AgencyTripTone =
        fillRate < 0.4 ? "critical" : fillRate < 0.7 ? "warning" : "healthy";
      const routeLabel = `${tripInstanceDeparture(trip) || "Départ"} → ${tripInstanceArrival(trip) || "Arrivée"}`;
      const avgPrice =
        reservationAggregate.reservedSeats > 0
          ? reservationAggregate.revenue / reservationAggregate.reservedSeats
          : Math.max(0, Number(trip.price ?? 0)) || params.averageTicketPrice;
      const estimatedLoss = Math.max(0, Math.round((capacity - reservationAggregate.reservedSeats) * avgPrice));

      return {
        id: trip.id,
        tripInstanceId: trip.id,
        routeLabel,
        departureTime: tripInstanceTime(trip) || "—",
        reservedSeats: reservationAggregate.reservedSeats,
        capacity,
        fillRate,
        tone,
        needsValidation,
        isLate,
        statusLabel: needsValidation ? "À valider" : isLate ? "En retard" : "En cours",
        estimatedLoss,
      };
    })
    .sort((left, right) => left.departureTime.localeCompare(right.departureTime));

  const weakTrips = liveTrips
    .filter((trip) => trip.fillRate < WEAK_FILL_RATE_THRESHOLD)
    .map<AgencyProblemItem>((trip) => ({
      id: trip.id,
      tripInstanceId: trip.tripInstanceId,
      routeLabel: trip.routeLabel,
      departureTime: trip.departureTime,
      fillRate: trip.fillRate,
      estimatedLoss: trip.estimatedLoss,
    }))
    .sort((left, right) => left.fillRate - right.fillRate)
    .slice(0, 6);

  const departuresToValidate = liveTrips.filter((trip) => trip.needsValidation);
  const arrivalsExpected = params.destinationTripsToday.filter((trip) => !tripHasArrived(trip)).length;
  const weeklyLeakEstimate = weakTrips.reduce((sum, trip) => sum + trip.estimatedLoss, 0) * 7;

  return {
    liveTrips,
    weakTrips,
    departuresToValidate,
    operations: {
      departuresToday: params.tripsToday.length,
      arrivalsExpected,
    },
    weeklyLeakEstimate,
  };
}

function getTodoItems(params: {
  departuresToValidate: AgencyLiveTripItem[];
  activePosts: AgencyActivePostItem[];
  pendingExpenses: AgencyPendingExpenseItem[];
}): AgencyTodoItem[] {
  return [
    {
      id: "departures",
      title: "Départs à valider",
      count: params.departuresToValidate.length,
      detail:
        params.departuresToValidate.length > 0
          ? "Validez immédiatement les trajets prêts à partir."
          : "Aucun départ bloqué pour le moment.",
      tone: params.departuresToValidate.length > 0 ? "critical" : "neutral",
      actionLabel: "Valider maintenant",
    },
    {
      id: "posts",
      title: "Postes actifs",
      count: params.activePosts.length,
      detail:
        params.activePosts.length > 0
          ? "Surveillez les ventes en cours sans passer par la caisse."
          : "Aucun poste actif en ce moment.",
      tone: params.activePosts.length > 0 ? "warning" : "neutral",
      actionLabel: "Voir les postes",
    },
    {
      id: "expenses",
      title: "Dépenses en attente",
      count: params.pendingExpenses.length,
      detail:
        params.pendingExpenses.length > 0
          ? "Traitez rapidement les validations qui bloquent le terrain."
          : "Aucune dépense en attente de votre validation.",
      tone: params.pendingExpenses.length > 0 ? "warning" : "neutral",
      actionLabel: "Traiter maintenant",
    },
  ];
}

function getAlerts(params: {
  activePosts: AgencyActivePostItem[];
  liveTrips: AgencyLiveTripItem[];
  totalSales: number;
  pendingExpenses: AgencyPendingExpenseItem[];
  now: Date;
}): AgencyAlertItem[] {
  const alerts: AgencyAlertItem[] = [];

  for (const post of params.activePosts) {
    const startedAt =
      toDateOrNull(post.startAt) ??
      toDateOrNull(post.openedAt) ??
      toDateOrNull(post.createdAt);
    if (!startedAt) continue;
    if (params.now.getTime() - startedAt.getTime() <= LONG_SESSION_THRESHOLD_MS) continue;
    alerts.push({
      id: `long-session-${post.id}`,
      title: "Poste actif depuis plus de 8 h",
      detail: `${post.label} est ouvert depuis ${post.durationLabel}. Risque de perte de ventes ou de blocage caisse.`,
      tone: "critical",
    });
  }

  if (params.totalSales <= 0 && params.activePosts.length > 0) {
    alerts.push({
      id: "zero-sales",
      title: "Aucune vente malgré poste actif",
      detail: "Sessions en cours détectées. Vérifiez maintenant l'agent, le tarif ou l'absence de demande.",
      tone: "warning",
    });
  }

  for (const trip of params.liveTrips.filter((row) => row.isLate).slice(0, 3)) {
    alerts.push({
      id: `late-trip-${trip.id}`,
      title: "Départ en retard",
      detail: `${trip.routeLabel} devait partir à ${trip.departureTime}. Validez ou traitez le retard maintenant.`,
      tone: "critical",
    });
  }

  if (params.pendingExpenses.length > 0) {
    alerts.push({
      id: "pending-expenses",
      title: "Validation dépenses à traiter",
      detail: `${params.pendingExpenses.length} dépense(s) attendent encore votre décision.`,
      tone: "warning",
    });
  }

  return alerts.slice(0, 6);
}

function getRecommendations(params: {
  weakTrips: AgencyProblemItem[];
  weeklyLeakEstimate: number;
}): AgencyRecommendation[] {
  if (params.weakTrips.length === 0) return [];

  const weakestTrip = params.weakTrips[0];
  const recommendations: AgencyRecommendation[] = [
    {
      id: `merge-${weakestTrip.id}`,
      title: "Fusionnez les départs les plus faibles",
      detail: `${weakestTrip.routeLabel} part trop vide. Regroupez la demande ou réduisez le nombre de départs sur cette plage.`,
      estimatedGain: Math.round(weakestTrip.estimatedLoss * 0.7),
      to: "/agence/planification",
    },
  ];

  if (params.weakTrips.length > 1) {
    const totalLeak = params.weakTrips.slice(0, 3).reduce((sum, trip) => sum + trip.estimatedLoss, 0);
    recommendations.push({
      id: "frequency-adjustment",
      title: "Ajustez la fréquence sur les trajets sous-remplis",
      detail: "Réduisez les créneaux qui consomment du cash sans volume suffisant.",
      estimatedGain: Math.round(totalLeak * 0.55),
      to: "/agence/planification",
    });
  }

  if (params.weeklyLeakEstimate > 0) {
    recommendations.push({
      id: "protect-margin",
      title: "Protégez votre marge dès cette semaine",
      detail: "Traitez les trajets sous-remplis avant qu’ils ne pèsent durablement sur le revenu de l’agence.",
      estimatedGain: Math.round(params.weeklyLeakEstimate * 0.35),
      to: "/agence/validation-departs",
    });
  }

  return recommendations.slice(0, 3);
}

function getActivityFeed(params: {
  reservationRows: ReservationRow[];
  shipmentsToday: Array<ShipmentRow & { amount: number; createdDate: Date | null }>;
  liveTrips: AgencyLiveTripItem[];
  now: Date;
}): AgencyActivityFeedItem[] {
  const reservationEvents = params.reservationRows
    .filter((reservation) => reservation.createdAt != null && !reservation.cancelled)
    .map<AgencyActivityFeedItem>((reservation) => ({
      id: `reservation-${reservation.id}`,
      kind: "ticket",
      title: reservation.online ? "Réservation en ligne" : "Billet vendu au guichet",
      detail: `${reservation.seats} place(s) • ${reservation.amount.toLocaleString("fr-FR")} FCFA`,
      occurredAt: reservation.createdAt,
      tone: "neutral",
    }));

  const shipmentEvents = params.shipmentsToday.map<AgencyActivityFeedItem>((shipment) => ({
    id: `shipment-${shipment.id}`,
    kind: "parcel",
    title: "Colis enregistré",
    detail: `${String(shipment.nature ?? "Colis")} • ${shipment.amount.toLocaleString("fr-FR")} FCFA`,
    occurredAt: shipment.createdDate,
    tone: "neutral",
  }));

  const delayEvents = params.liveTrips
    .filter((trip) => trip.isLate)
    .map<AgencyActivityFeedItem>((trip) => ({
      id: `delay-${trip.id}`,
      kind: "delay",
      title: "Retard détecté",
      detail: `${trip.routeLabel} • départ prévu ${trip.departureTime}`,
      occurredAt: params.now,
      tone: "warning",
    }));

  const departureEvents = params.liveTrips
    .filter((trip) => !trip.needsValidation && !trip.isLate)
    .slice(0, 2)
    .map<AgencyActivityFeedItem>((trip) => ({
      id: `departure-${trip.id}`,
      kind: "departure",
      title: "Départ prêt",
      detail: `${trip.routeLabel} • ${trip.departureTime}`,
      occurredAt: params.now,
      tone: "neutral",
    }));

  return [...reservationEvents, ...shipmentEvents, ...delayEvents, ...departureEvents]
    .sort((left, right) => (right.occurredAt?.getTime() ?? 0) - (left.occurredAt?.getTime() ?? 0))
    .slice(0, 8);
}

export function useAgencyActionCockpit() {
  const { user } = useAuth() as {
    user?: {
      uid?: string;
      companyId?: string;
      agencyId?: string;
      agencyTimezone?: string;
      role?: string | string[];
    } | null;
  };

  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const userId = user?.uid ?? "";
  const roleList = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const approverRole =
    roleList.find((role) => role === "chefAgence" || role === "chefagence" || role === "admin_compagnie") ??
    roleList[0] ??
    null;

  const agencyTimezone = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );
  const todayKey = useMemo(() => getTodayForTimezone(agencyTimezone), [agencyTimezone]);
  const dayStart = useMemo(() => getStartOfDayForDate(todayKey, agencyTimezone), [todayKey, agencyTimezone]);
  const dayEnd = useMemo(() => getEndOfDayForDate(todayKey, agencyTimezone), [todayKey, agencyTimezone]);

  const { plan, loading: planLoading } = useCompanyPlan(companyId);
  const isPremium = plan === "premium";

  const [activeShifts, setActiveShifts] = useState<SessionDoc[]>([]);
  const [activeCourierSessions, setActiveCourierSessions] = useState<SessionDoc[]>([]);
  const [rawReservations, setRawReservations] = useState<Array<Record<string, unknown>>>([]);
  const [rawShipments, setRawShipments] = useState<ShipmentRow[]>([]);
  const [originTrips, setOriginTrips] = useState<TripInstanceDocWithId[]>([]);
  const [destinationTrips, setDestinationTrips] = useState<TripInstanceDocWithId[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<AgencyPendingExpenseItem[]>([]);

  const [loadingShifts, setLoadingShifts] = useState(true);
  const [loadingCourierSessions, setLoadingCourierSessions] = useState(true);
  const [loadingReservations, setLoadingReservations] = useState(true);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);

  const [validatingTripId, setValidatingTripId] = useState<string | null>(null);
  const [processingExpenseId, setProcessingExpenseId] = useState<string | null>(null);
  const [timeTick, setTimeTick] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTimeTick((value) => value + 1);
    }, 60000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setActiveShifts([]);
      setLoadingShifts(false);
      return;
    }

    setLoadingShifts(true);
    return onSnapshot(
      query(
        collection(db, "companies", companyId, "agences", agencyId, "shifts"),
        where("status", "in", ["active", "paused"]),
        limit(50)
      ),
      (snapshot) => {
        setActiveShifts(
          snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              kind: "guichet" as const,
              type: "guichet",
              ...(docSnap.data() as Omit<SessionDoc, "id" | "kind" | "type">),
            }))
            .filter((session) => isSessionOpen(session.status))
        );
        setLoadingShifts(false);
      },
      () => {
        setActiveShifts([]);
        setLoadingShifts(false);
      }
    );
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setActiveCourierSessions([]);
      setLoadingCourierSessions(false);
      return;
    }

    setLoadingCourierSessions(true);
    return onSnapshot(
      query(courierSessionsRef(db, companyId, agencyId), where("status", "==", "ACTIVE"), limit(40)),
      (snapshot) => {
        setActiveCourierSessions(
          snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              kind: "courrier" as const,
              type: "courrier",
              ...(docSnap.data() as Omit<SessionDoc, "id" | "kind" | "type">),
            }))
            .filter((session) => isCourierSessionOpen(session.status))
        );
        setLoadingCourierSessions(false);
      },
      () => {
        setActiveCourierSessions([]);
        setLoadingCourierSessions(false);
      }
    );
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId || !todayKey) {
      setRawReservations([]);
      setLoadingReservations(false);
      return;
    }

    setLoadingReservations(true);
    return onSnapshot(
      query(
        collection(db, "companies", companyId, "agences", agencyId, "reservations"),
        where("date", "==", todayKey),
        limit(500)
      ),
      (snapshot) => {
        setRawReservations(snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) })));
        setLoadingReservations(false);
      },
      () => {
        setRawReservations([]);
        setLoadingReservations(false);
      }
    );
  }, [companyId, agencyId, todayKey]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setRawShipments([]);
      setLoadingShipments(false);
      return;
    }

    setLoadingShipments(true);
    return onSnapshot(
      query(shipmentsRef(db, companyId), where("originAgencyId", "==", agencyId), limit(250)),
      (snapshot) => {
        setRawShipments(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data() as Omit<ShipmentRow, "id">;
            return { ...data, id: docSnap.id };
          })
        );
        setLoadingShipments(false);
      },
      () => {
        setRawShipments([]);
        setLoadingShipments(false);
      }
    );
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setOriginTrips([]);
      setDestinationTrips([]);
      setLoadingTrips(false);
      return;
    }

    setLoadingTrips(true);
    const tripCollection = collection(db, "companies", companyId, "tripInstances");

    const unsubOrigin = onSnapshot(
      query(tripCollection, where("agencyId", "==", agencyId), limit(150)),
      (snapshot) => {
        setOriginTrips(
          snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TripInstanceDocWithId, "id">) }))
        );
        setLoadingTrips(false);
      },
      () => {
        setOriginTrips([]);
        setLoadingTrips(false);
      }
    );

    const unsubDestination = onSnapshot(
      query(tripCollection, where("destinationAgencyId", "==", agencyId), limit(150)),
      (snapshot) => {
        setDestinationTrips(
          snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<TripInstanceDocWithId, "id">) }))
        );
      },
      () => {
        setDestinationTrips([]);
      }
    );

    return () => {
      unsubOrigin();
      unsubDestination();
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setPendingExpenses([]);
      setLoadingExpenses(false);
      return;
    }

    let cancelled = false;
    const loadExpenses = () => {
      setLoadingExpenses(true);
      void listExpenses(companyId, {
        agencyId,
        statusIn: ["pending", "pending_manager"],
        limitCount: 30,
      })
        .then((rows) => {
          if (cancelled) return;
          setPendingExpenses(rows);
          setLoadingExpenses(false);
        })
        .catch(() => {
          if (cancelled) return;
          setPendingExpenses([]);
          setLoadingExpenses(false);
        });
    };

    loadExpenses();
    const intervalId = window.setInterval(loadExpenses, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [companyId, agencyId]);

  // ✅ APPROCHE ROBUSTE: Logique métier avec fallbacks
  const reservationRows = useMemo<ReservationRow[]>(() => {
    return rawReservations.map((raw) => {
      const normalized = normalizeReservation(raw);
      const reservationStatus = normalizeText(normalized.reservation.status);
      
      const cancelled = isReservationCancelled(reservationStatus);
      const isConfirmedStatus = ["confirme", "confirmé"].includes(reservationStatus);
      const online = isOnlinePaymentChannel(raw);
      
      // ✅ ONLINE = validée manuellement (confirme/confirmé)
      const onlineConfirmed = online && isConfirmedStatus;
      
      // ✅ FALLBACK: Si le statut est "paye" ou "paid", on considère aussi comme valide
      const isPaidStatus = ["paye", "payé", "paid"].includes(reservationStatus);
      const onlineValid = online && (onlineConfirmed || isPaidStatus);
      
      // ✅ GUICHET = toujours vendu (pas de validation intermédiaire)
      const guichetSold = !online;
      
      const sold = cancelled ? false : online ? onlineValid : guichetSold;

      return {
        id: String(raw.id ?? ""),
        raw,
        normalized,
        amount: Math.max(0, Number(normalized.payment.amount ?? 0)),
        seats: Math.max(
          1,
          Number(raw.seatsGo ?? 0) + Number(raw.seatsReturn ?? 0) ||
          Number(raw.seats ?? 0) ||
          1
        ),
        createdAt: normalized.reservation.createdAt ?? toDateOrNull(raw.createdAt),
        confirmed: sold,
        cancelled,
        online,
        onlinePaid: onlineValid,
        sold,
        tripInstanceId: String(
          normalized.trip.tripInstanceId ??
          raw.tripInstanceId ??
          ""
        ).trim(),
      };
    });
  }, [rawReservations]);

  const shipmentsToday = useMemo<Array<ShipmentRow & { amount: number; createdDate: Date | null }>>(() => {
    return rawShipments
      .map((shipment) => {
        const createdDate = toDateOrNull(shipment.createdAt);
        return {
          ...shipment,
          amount:
            Math.max(0, Number(shipment.transportFee ?? 0)) +
            Math.max(0, Number(shipment.insuranceAmount ?? 0)),
          createdDate,
        };
      })
      .filter((shipment) => {
        if (!shipment.createdDate) return false;
        return shipment.createdDate >= dayStart && shipment.createdDate <= dayEnd;
      });
  }, [rawShipments, dayStart, dayEnd]);

  const tripsToday = useMemo(
    () => originTrips.filter((trip) => String(trip.date ?? "") === todayKey),
    [originTrips, todayKey]
  );
  const destinationTripsToday = useMemo(
    () => destinationTrips.filter((trip) => String(trip.date ?? "") === todayKey),
    [destinationTrips, todayKey]
  );

  const averageTicketPrice = useMemo(() => {
    // ✅ On utilise TOUTES les réservations (pas de filtre sold)
    const soldReservations = reservationRows.filter((reservation) => reservation.sold);
    const totalSeats = soldReservations.reduce((sum, reservation) => sum + reservation.seats, 0);
    const totalAmount = soldReservations.reduce((sum, reservation) => sum + reservation.amount, 0);
    if (totalSeats <= 0) return 0;
    return totalAmount / totalSeats;
  }, [reservationRows]);

  const now = useMemo(() => new Date(), [timeTick]);

  // ✅ PLUS DE FILTRE sold DESTRUCTEUR
  const liveActivity = useMemo(
    () =>
      getSessionDrivenLiveActivity({
        activeGuichetSessions: activeShifts,
        activeCourierSessions,
        reservationRows: reservationRows, // ⚠️ TOUTES les réservations
        shipmentsToday,
        now,
      }),
    [activeShifts, activeCourierSessions, reservationRows, shipmentsToday, now]
  );

  // ✅ On garde le filtre sold pour les agrégats de trajets (cohérence métier)
  const reservationAggregates = useMemo(
    () => getTripReservationAggregates(reservationRows.filter((reservation) => reservation.sold)),
    [reservationRows]
  );

  const tripInsights = useMemo(
    () =>
      getTripsAnalysis({
        tripsToday,
        destinationTripsToday,
        reservationAggregates,
        averageTicketPrice,
        agencyTimezone,
        now,
      }),
    [tripsToday, destinationTripsToday, reservationAggregates, averageTicketPrice, agencyTimezone, now]
  );

  const summary = useMemo(() => {
    const guichetSales = liveActivity.guichet.amount;
    const onlineSales = liveActivity.online.amount;
    const parcelSales = shipmentsToday.reduce((sum, shipment) => sum + shipment.amount, 0);
    return {
      guichetSales,
      onlineSales,
      totalSales: guichetSales + onlineSales,
      expectedCash: guichetSales + parcelSales,
    };
  }, [liveActivity.guichet.amount, liveActivity.online.amount, shipmentsToday]);

  const alerts = useMemo(
    () =>
      getAlerts({
        activePosts: liveActivity.activePosts,
        liveTrips: tripInsights.liveTrips,
        totalSales: summary.totalSales,
        pendingExpenses,
        now,
      }),
    [liveActivity.activePosts, tripInsights.liveTrips, summary.totalSales, pendingExpenses, now]
  );

  const recommendations = useMemo(
    () =>
      getRecommendations({
        weakTrips: tripInsights.weakTrips,
        weeklyLeakEstimate: tripInsights.weeklyLeakEstimate,
      }),
    [tripInsights.weakTrips, tripInsights.weeklyLeakEstimate]
  );

  const activityFeed = useMemo(
    () =>
      getActivityFeed({
        reservationRows: reservationRows.filter((reservation) => reservation.sold),
        shipmentsToday,
        liveTrips: tripInsights.liveTrips,
        now,
      }),
    [reservationRows, shipmentsToday, tripInsights.liveTrips, now]
  );

  const todoItems = useMemo(
    () =>
      getTodoItems({
        departuresToValidate: tripInsights.departuresToValidate,
        activePosts: liveActivity.activePosts,
        pendingExpenses,
      }),
    [tripInsights.departuresToValidate, liveActivity.activePosts, pendingExpenses]
  );

  const validateDeparture = useCallback(
    async (tripInstanceId: string) => {
      if (!companyId || !userId) throw new Error("Contexte agence indisponible.");
      setValidatingTripId(tripInstanceId);
      try {
        await markOriginDeparture(companyId, tripInstanceId, userId);
      } finally {
        setValidatingTripId(null);
      }
    },
    [companyId, userId]
  );

  const approvePendingExpense = useCallback(
    async (expenseId: string) => {
      if (!companyId || !userId || !approverRole) throw new Error("Validation indisponible.");
      setProcessingExpenseId(expenseId);
      try {
        await approveExpense(companyId, expenseId, userId, approverRole);
      } finally {
        setProcessingExpenseId(null);
      }
    },
    [companyId, userId, approverRole]
  );

  const rejectPendingExpense = useCallback(
    async (expenseId: string, reason: string) => {
      if (!companyId || !userId || !approverRole) throw new Error("Validation indisponible.");
      setProcessingExpenseId(expenseId);
      try {
        await rejectExpense(companyId, expenseId, userId, reason, approverRole);
      } finally {
        setProcessingExpenseId(null);
      }
    },
    [companyId, userId, approverRole]
  );

  return {
    loading:
      planLoading ||
      loadingShifts ||
      loadingCourierSessions ||
      loadingReservations ||
      loadingShipments ||
      loadingTrips ||
      loadingExpenses,
    plan,
    isPremium,
    companyId,
    agencyId,
    liveActivity,
    liveTrips: tripInsights.liveTrips,
    todoItems,
    alerts,
    activityFeed,
    summary,
    operations: tripInsights.operations,
    weakTrips: tripInsights.weakTrips,
    recommendations,
    weeklyLeakEstimate: tripInsights.weeklyLeakEstimate,
    departuresToValidate: tripInsights.departuresToValidate,
    activePosts: liveActivity.activePosts,
    pendingExpenses,
    validatingTripId,
    processingExpenseId,
    validateDeparture,
    approvePendingExpense,
    rejectPendingExpense,
  };
}