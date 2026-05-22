import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { db } from "@/firebaseConfig";
import { normalizeReservation } from "@/lib/normalizeReservation";
import {
  TZ_BAMAKO,
  getTodayBamako,
} from "@/shared/date/dateUtilsTz";
import {
  tripInstanceArrival,
  tripInstanceDeparture,
  tripInstanceSeatCapacity,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";

dayjs.extend(utc);
dayjs.extend(timezone);

type FirestoreRecord = Record<string, unknown>;
type OperationKind = "reservation" | "parcel";

export type CeoInsightsPeriod = "today" | "7d" | "30d";

export type CeoAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  impact: number;
};

export type CeoRecommendation = {
  id: string;
  title: string;
  detail: string;
  impact: number;
  actionHref: string;
  actionLabel: string;
};

export type CeoAgencyInsight = {
  agencyId: string;
  agencyName: string;
  revenue: number;
  operations: number;
  reservations: number;
  parcels: number;
  share: number;
  todayRevenue: number;
  growth: number;
};

export type CeoRouteInsight = {
  routeKey: string;
  routeLabel: string;
  revenue: number;
  operations: number;
  reservations: number;
  parcels: number;
  fillRate: number | null;
  trips: number;
  estimatedImpact: number;
};

export type CeoInsights = {
  loading: boolean;
  revenueToday: number;
  revenuePeriod: number;
  growth: number;
  activeAgencies: number;
  alerts: CeoAlert[];
  recommendations: CeoRecommendation[];
  topAgencies: CeoAgencyInsight[];
  weakAgencies: CeoAgencyInsight[];
  topRoutes: CeoRouteInsight[];
  weakRoutes: CeoRouteInsight[];
};

type AgencyMeta = {
  id: string;
  name: string;
};

type OperationRecord = {
  id: string;
  agencyId: string;
  kind: OperationKind;
  amount: number;
  dateKey: string | null;
  routeKey: string;
  routeLabel: string;
  tripInstanceId: string | null;
};

type PaymentRecord = {
  id: string;
  amount: number;
  dateKey: string | null;
  status: string;
};

type ExpenseRecord = {
  id: string;
  amount: number;
  dateKey: string | null;
  status: string;
};

type TripInstanceRecord = {
  id: string;
  routeKey: string;
  routeLabel: string;
  dateKey: string | null;
  capacity: number;
  passengerCount: number;
};

type SourceSnapshot = {
  loading: boolean;
  agencies: AgencyMeta[];
  reservations: OperationRecord[];
  parcels: OperationRecord[];
  payments: PaymentRecord[];
  expenses: ExpenseRecord[];
  tripInstances: TripInstanceRecord[];
};

const EMPTY_SOURCE: SourceSnapshot = {
  loading: true,
  agencies: [],
  reservations: [],
  parcels: [],
  payments: [],
  expenses: [],
  tripInstances: [],
};

const EMPTY_INSIGHTS: CeoInsights = {
  loading: true,
  revenueToday: 0,
  revenuePeriod: 0,
  growth: 0,
  activeAgencies: 0,
  alerts: [],
  recommendations: [],
  topAgencies: [],
  weakAgencies: [],
  topRoutes: [],
  weakRoutes: [],
};

const MIN_ALERT_ROUTE_TRIPS = 2;
const MIN_ALERT_ROUTE_REVENUE = 75_000;
const MIN_ALERT_ROUTE_RESERVATIONS = 8;
const MIN_ALERT_AGENCY_RECENT_REVENUE = 80_000;
const MIN_ALERT_DAILY_BASELINE = 100_000;
const EXPENSES_WATCH_RATIO = 0.35;
const PAYMENT_CONVERSION_RATIO = 0.7;
const DOMINANT_AGENCY_SHARE = 0.45;
const MAX_REASONABLE_IMPACT = 5_000_000;
const WARNING_IMPACT_THRESHOLD = 20_000;
const CRITICAL_IMPACT_THRESHOLD = 100_000;

function isRecord(value: unknown): value is FirestoreRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next;
  }
  if (typeof value === "string") {
    const next = new Date(value);
    return Number.isNaN(next.getTime()) ? null : next;
  }
  if (isRecord(value)) {
    const timestampLike = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestampLike.toDate === "function") {
      const next = timestampLike.toDate();
      return Number.isNaN(next.getTime()) ? null : next;
    }
    if (typeof timestampLike.seconds === "number") {
      const next = new Date(timestampLike.seconds * 1000);
      return Number.isNaN(next.getTime()) ? null : next;
    }
  }
  return null;
}

function toDateKey(value: Date | null): string | null {
  if (!value) return null;
  return dayjs(value).tz(TZ_BAMAKO).format("YYYY-MM-DD");
}

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeStatusKey(value: unknown): string {
  return normalizeToken(value).replace(/[\s-]+/g, "_");
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const next = String(value ?? "").trim();
    if (next) return next;
  }
  return "";
}

function buildRoute(routeFrom: unknown, routeTo: unknown, fallback: string) {
  const from = firstText(routeFrom);
  const to = firstText(routeTo);
  const routeLabel = from && to ? `${from} -> ${to}` : fallback;
  const routeKey = `${normalizeToken(from || fallback)}::${normalizeToken(to || fallback)}`;

  return {
    routeLabel,
    routeKey,
  };
}

function isConfirmedReservation(data: FirestoreRecord): boolean {
  const normalized = normalizeReservation(data);
  const paymentStatus = normalizeStatusKey(normalized.payment.status);
  const reservationStatus = normalizeToken(normalized.reservation.status);
  const rawStatus = normalizeToken(data.status ?? data.statut);

  if (paymentStatus === "paid" || paymentStatus === "validated") return true;

  return ["confirm", "paye", "valid"].some(
    (token) => reservationStatus.includes(token) || rawStatus.includes(token)
  );
}

function isConfirmedParcel(data: FirestoreRecord): boolean {
  const status = normalizeToken(data.status ?? data.currentStatus ?? data.statut);
  const paymentStatus = normalizeStatusKey(data.paymentStatus);

  if (paymentStatus === "paid_origin" || paymentStatus === "paid_destination") return true;

  return ["confirm", "valid", "livre", "delivered"].some((token) => status.includes(token));
}

function isValidatedPayment(data: FirestoreRecord): boolean {
  const status = normalizeStatusKey(data.status);
  return status === "validated" || status === "valide" || status === "paid";
}

function isRecognizedExpense(data: FirestoreRecord): boolean {
  const status = normalizeStatusKey(data.status);
  return status === "approved" || status === "approuve" || status === "paid" || status === "paye";
}

function readReservationOperations(
  agencyId: string,
  docs: QueryDocumentSnapshot[]
): OperationRecord[] {
  return docs
    .map((docSnap) => {
      const data = docSnap.data() as FirestoreRecord;
      if (!isConfirmedReservation(data)) return null;

      const normalized = normalizeReservation(data);
      const route = buildRoute(
        normalized.trip.departure ?? data.departure ?? data.depart ?? data.routeDeparture,
        normalized.trip.arrival ?? data.arrival ?? data.arrivee ?? data.routeArrival,
        "Trajet non renseigne"
      );

      return {
        id: docSnap.id,
        agencyId,
        kind: "reservation" as const,
        amount: Math.max(
          0,
          toNumber(
            data.montant ??
              data.total ??
              data.amount ??
              data.totalAmount ??
              normalized.payment.amount,
            0
          )
        ),
        dateKey: toDateKey(
          toDate(data.confirmedAt ?? normalized.reservation.createdAt ?? data.createdAt ?? data.date)
        ),
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        tripInstanceId: firstText(
          normalized.trip.tripInstanceId,
          data.tripInstanceId,
          data.tripId
        ) || null,
      };
    })
    .filter(Boolean) as OperationRecord[];
}

function readParcelOperations(
  agencyId: string,
  docs: QueryDocumentSnapshot[]
): OperationRecord[] {
  return docs
    .map((docSnap) => {
      const data = docSnap.data() as FirestoreRecord;
      if (!isConfirmedParcel(data)) return null;

      const route = buildRoute(
        data.departure ??
          data.depart ??
          data.originAgencyName ??
          data.originAgencyId,
        data.arrival ??
          data.arrivee ??
          data.destinationAgencyName ??
          data.destinationAgencyId,
        "Circuit colis"
      );

      return {
        id: docSnap.id,
        agencyId,
        kind: "parcel" as const,
        amount: Math.max(
          0,
          toNumber(
            data.totalAmount ??
              data.montant_total ??
              data.amount ??
              data.montant ??
              data.transportFee,
            0
          ) + toNumber(data.insuranceAmount, 0)
        ),
        dateKey: toDateKey(toDate(data.confirmedAt ?? data.createdAt ?? data.updatedAt ?? data.date)),
        routeKey: route.routeKey,
        routeLabel: route.routeLabel,
        tripInstanceId: firstText(data.tripInstanceId, data.tripId) || null,
      };
    })
    .filter(Boolean) as OperationRecord[];
}

function readPayments(docs: QueryDocumentSnapshot[]): PaymentRecord[] {
  return docs
    .map((docSnap) => {
      const data = docSnap.data() as FirestoreRecord;
      if (!isValidatedPayment(data)) return null;
      return {
        id: docSnap.id,
        amount: Math.max(0, toNumber(data.amount ?? data.montant, 0)),
        dateKey: toDateKey(toDate(data.validatedAt ?? data.createdAt)),
        status: String(data.status ?? ""),
      };
    })
    .filter((row): row is PaymentRecord => row !== null);
}

function readExpenses(docs: QueryDocumentSnapshot[]): ExpenseRecord[] {
  return docs
    .map((docSnap) => {
      const data = docSnap.data() as FirestoreRecord;
      if (!isRecognizedExpense(data)) return null;
      return {
        id: docSnap.id,
        amount: Math.max(0, toNumber(data.amount ?? data.montant, 0)),
        dateKey: toDateKey(toDate(data.paidAt ?? data.approvedAt ?? data.createdAt)),
        status: String(data.status ?? ""),
      };
    })
    .filter((row): row is ExpenseRecord => row !== null);
}

function readTripInstances(docs: QueryDocumentSnapshot[]): TripInstanceRecord[] {
  return docs.map((docSnap) => {
    const data = docSnap.data() as FirestoreRecord;
    const route = buildRoute(
      tripInstanceDeparture(data),
      tripInstanceArrival(data),
      "Trajet non renseigne"
    );

    return {
      id: docSnap.id,
      routeKey: route.routeKey,
      routeLabel: route.routeLabel,
      dateKey: firstText(data.date) || toDateKey(toDate(data.departureDate ?? data.createdAt)),
      capacity: Math.max(0, tripInstanceSeatCapacity(data)),
      passengerCount: Math.max(0, toNumber(data.passengerCount ?? data.reservedSeats, 0)),
    };
  });
}

function sortByRevenueDesc<T extends { revenue: number; operations: number }>(rows: T[]): T[] {
  return [...rows].sort(
    (left, right) => right.revenue - left.revenue || right.operations - left.operations
  );
}

function sortWeakRoutes(rows: CeoRouteInsight[]): CeoRouteInsight[] {
  return [...rows].sort((left, right) => {
    const leftFill = left.fillRate ?? Number.POSITIVE_INFINITY;
    const rightFill = right.fillRate ?? Number.POSITIVE_INFINITY;

    return (
      leftFill - rightFill ||
      left.revenue - right.revenue ||
      left.operations - right.operations
    );
  });
}

function getPeriodMeta(period: CeoInsightsPeriod) {
  const end = dayjs.tz(`${getTodayBamako()}T12:00:00`, TZ_BAMAKO);
  const days = period === "today" ? 1 : period === "7d" ? 7 : 30;
  const start = end.subtract(days - 1, "day");
  const previousEnd = start.subtract(1, "day");
  const previousStart = previousEnd.subtract(days - 1, "day");

  return {
    todayKey: end.format("YYYY-MM-DD"),
    startKey: start.format("YYYY-MM-DD"),
    endKey: end.format("YYYY-MM-DD"),
    previousStartKey: previousStart.format("YYYY-MM-DD"),
    previousEndKey: previousEnd.format("YYYY-MM-DD"),
  };
}

function isInRange(dateKey: string | null, startKey: string, endKey: string): boolean {
  return Boolean(dateKey && dateKey >= startKey && dateKey <= endKey);
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

type PeriodMeta = ReturnType<typeof getPeriodMeta>;

type HealthMetrics = {
  allOperations: OperationRecord[];
  currentOperations: OperationRecord[];
  previousOperations: OperationRecord[];
  revenueToday: number;
  revenuePeriod: number;
  growth: number;
  paymentsPeriod: number;
  expensesPeriod: number;
  averageLastSevenDaysRevenue: number;
  revenueDropImpact: number;
  recentAgencyRevenueById: Map<string, number>;
  recentAgencyAverageById: Map<string, number>;
};

type AgenciesPerformance = {
  activeAgencies: number;
  agencyRows: CeoAgencyInsight[];
  topAgencies: CeoAgencyInsight[];
  weakAgencies: CeoAgencyInsight[];
  inactiveToday: CeoAgencyInsight[];
  inactiveTodayImpact: number;
  dominantAgency: CeoAgencyInsight | null;
};

type RoutesPerformance = {
  routeRows: CeoRouteInsight[];
  topRoutes: CeoRouteInsight[];
  weakRoutes: CeoRouteInsight[];
  weakestRouteByFill: CeoRouteInsight | null;
};

function safeImpact(rawImpact: number): number {
  const rounded = Math.round(Number(rawImpact) || 0);
  return Math.max(0, Math.min(rounded, MAX_REASONABLE_IMPACT));
}

function getAlertSeverity(impact: number): CeoAlert["severity"] {
  if (impact > CRITICAL_IMPACT_THRESHOLD) return "critical";
  if (impact > WARNING_IMPACT_THRESHOLD) return "warning";
  return "info";
}

function sortAlertsByPriority(alerts: CeoAlert[]): CeoAlert[] {
  const priority: Record<CeoAlert["severity"], number> = {
    critical: 3,
    warning: 2,
    info: 1,
  };

  return [...alerts].sort(
    (left, right) =>
      priority[right.severity] - priority[left.severity] ||
      right.impact - left.impact ||
      left.title.localeCompare(right.title)
  );
}

function buildCompanyPath(companyId: string, path: string): string {
  return `/compagnie/${companyId}/${path}`;
}

function getHealthMetrics(
  source: SourceSnapshot,
  meta: PeriodMeta
): HealthMetrics {
  const allOperations = [...source.reservations, ...source.parcels];

  const currentOperations = allOperations.filter((row) =>
    isInRange(row.dateKey, meta.startKey, meta.endKey)
  );
  const previousOperations = allOperations.filter((row) =>
    isInRange(row.dateKey, meta.previousStartKey, meta.previousEndKey)
  );

  const revenueToday = allOperations
    .filter((row) => row.dateKey === meta.todayKey)
    .reduce((sum, row) => sum + row.amount, 0);
  const revenuePeriod = currentOperations.reduce((sum, row) => sum + row.amount, 0);
  const previousRevenue = previousOperations.reduce((sum, row) => sum + row.amount, 0);
  const growth =
    previousRevenue > 0
      ? roundPercentage(((revenuePeriod - previousRevenue) / previousRevenue) * 100)
      : revenuePeriod > 0
        ? 100
        : 0;

  const lastSevenDays = Array.from({ length: 7 }, (_, index) =>
    dayjs
      .tz(`${meta.todayKey}T12:00:00`, TZ_BAMAKO)
      .subtract(index + 1, "day")
      .format("YYYY-MM-DD")
  );
  const lastSevenDaySet = new Set(lastSevenDays);
  const averageLastSevenDaysRevenue =
    lastSevenDays.reduce((sum, dateKey) => {
      const dayRevenue = allOperations
        .filter((row) => row.dateKey === dateKey)
        .reduce((value, row) => value + row.amount, 0);
      return sum + dayRevenue;
    }, 0) / 7;

  const recentAgencyRevenueById = new Map<string, number>();
  const recentAgencyAverageById = new Map<string, number>();

  for (const agency of source.agencies) {
    const recentRevenue = allOperations
      .filter(
        (row) =>
          row.agencyId === agency.id &&
          row.dateKey != null &&
          lastSevenDaySet.has(row.dateKey)
      )
      .reduce((sum, row) => sum + row.amount, 0);

    recentAgencyRevenueById.set(agency.id, recentRevenue);
    recentAgencyAverageById.set(agency.id, recentRevenue / 7);
  }

  const paymentsPeriod = source.payments
    .filter((row) => isInRange(row.dateKey, meta.startKey, meta.endKey))
    .reduce((sum, row) => sum + row.amount, 0);
  const expensesPeriod = source.expenses
    .filter((row) => isInRange(row.dateKey, meta.startKey, meta.endKey))
    .reduce((sum, row) => sum + row.amount, 0);

  return {
    allOperations,
    currentOperations,
    previousOperations,
    revenueToday,
    revenuePeriod,
    growth,
    paymentsPeriod,
    expensesPeriod,
    averageLastSevenDaysRevenue,
    revenueDropImpact: safeImpact(averageLastSevenDaysRevenue - revenueToday),
    recentAgencyRevenueById,
    recentAgencyAverageById,
  };
}

function getAgenciesPerformance(
  source: SourceSnapshot,
  health: HealthMetrics,
  meta: PeriodMeta
): AgenciesPerformance {
  const agencyRows: CeoAgencyInsight[] = source.agencies.map((agency) => {
    const agencyCurrent = health.currentOperations.filter((row) => row.agencyId === agency.id);
    const agencyPrevious = health.previousOperations.filter((row) => row.agencyId === agency.id);
    const todayCurrent = health.allOperations.filter(
      (row) => row.agencyId === agency.id && row.dateKey === meta.todayKey
    );

    const agencyRevenue = agencyCurrent.reduce((sum, row) => sum + row.amount, 0);
    const agencyPreviousRevenue = agencyPrevious.reduce((sum, row) => sum + row.amount, 0);

    return {
      agencyId: agency.id,
      agencyName: agency.name,
      revenue: agencyRevenue,
      operations: agencyCurrent.length,
      reservations: agencyCurrent.filter((row) => row.kind === "reservation").length,
      parcels: agencyCurrent.filter((row) => row.kind === "parcel").length,
      share: health.revenuePeriod > 0 ? agencyRevenue / health.revenuePeriod : 0,
      todayRevenue: todayCurrent.reduce((sum, row) => sum + row.amount, 0),
      growth:
        agencyPreviousRevenue > 0
          ? roundPercentage(((agencyRevenue - agencyPreviousRevenue) / agencyPreviousRevenue) * 100)
          : agencyRevenue > 0
            ? 100
            : 0,
    };
  });

  const activeAgencies = agencyRows.filter((row) => row.operations > 0).length;
  const topAgencies = sortByRevenueDesc(agencyRows).slice(0, 4);
  const weakAgencies = [...agencyRows]
    .sort(
      (left, right) =>
        left.revenue - right.revenue ||
        left.operations - right.operations ||
        left.agencyName.localeCompare(right.agencyName)
    )
    .slice(0, 4);

  const inactiveToday = agencyRows.filter(
    (row) =>
      row.todayRevenue <= 0 &&
      (health.recentAgencyRevenueById.get(row.agencyId) ?? 0) >= MIN_ALERT_AGENCY_RECENT_REVENUE
  );
  const inactiveTodayImpact = safeImpact(
    inactiveToday.reduce(
      (sum, row) => sum + (health.recentAgencyAverageById.get(row.agencyId) ?? 0),
      0
    )
  );

  return {
    activeAgencies,
    agencyRows,
    topAgencies,
    weakAgencies,
    inactiveToday,
    inactiveTodayImpact,
    dominantAgency: topAgencies[0] ?? null,
  };
}

function getRoutesAnalysis(
  source: SourceSnapshot,
  health: HealthMetrics,
  meta: PeriodMeta
): RoutesPerformance {
  const routeMap = new Map<
    string,
    {
      routeKey: string;
      routeLabel: string;
      revenue: number;
      reservationRevenue: number;
      operations: number;
      reservations: number;
      parcels: number;
      trips: number;
      capacity: number;
      passengerCount: number;
    }
  >();

  for (const row of health.currentOperations) {
    const bucket = routeMap.get(row.routeKey) ?? {
      routeKey: row.routeKey,
      routeLabel: row.routeLabel,
      revenue: 0,
      reservationRevenue: 0,
      operations: 0,
      reservations: 0,
      parcels: 0,
      trips: 0,
      capacity: 0,
      passengerCount: 0,
    };
    bucket.revenue += row.amount;
    bucket.operations += 1;
    if (row.kind === "reservation") {
      bucket.reservations += 1;
      bucket.reservationRevenue += row.amount;
    }
    if (row.kind === "parcel") bucket.parcels += 1;
    routeMap.set(row.routeKey, bucket);
  }

  for (const trip of source.tripInstances.filter((row) =>
    isInRange(row.dateKey, meta.startKey, meta.endKey)
  )) {
    const bucket = routeMap.get(trip.routeKey) ?? {
      routeKey: trip.routeKey,
      routeLabel: trip.routeLabel,
      revenue: 0,
      reservationRevenue: 0,
      operations: 0,
      reservations: 0,
      parcels: 0,
      trips: 0,
      capacity: 0,
      passengerCount: 0,
    };
    bucket.routeLabel = trip.routeLabel || bucket.routeLabel;
    bucket.trips += 1;
    bucket.capacity += trip.capacity;
    bucket.passengerCount += trip.passengerCount;
    routeMap.set(trip.routeKey, bucket);
  }

  const routeRows: CeoRouteInsight[] = Array.from(routeMap.values()).map((row) => {
    const fillRate =
      row.capacity > 0 ? Math.max(0, Math.min(1, row.passengerCount / row.capacity)) : null;
    const averageTicketPrice =
      row.reservations > 0 ? row.reservationRevenue / row.reservations : 0;
    const unsoldSeats = Math.max(0, row.capacity - row.passengerCount);

    return {
      routeKey: row.routeKey,
      routeLabel: row.routeLabel,
      revenue: row.revenue,
      operations: row.operations,
      reservations: row.reservations,
      parcels: row.parcels,
      fillRate,
      trips: row.trips,
      estimatedImpact:
        averageTicketPrice > 0 ? safeImpact(unsoldSeats * averageTicketPrice) : 0,
    };
  });

  const topRoutes = sortByRevenueDesc(routeRows).slice(0, 4);
  const weakRoutes = sortWeakRoutes(routeRows).slice(0, 4);
  const weakRouteCandidates = weakRoutes.filter(
    (row) =>
      row.fillRate !== null &&
      row.fillRate < 0.5 &&
      row.trips >= MIN_ALERT_ROUTE_TRIPS &&
      row.revenue >= MIN_ALERT_ROUTE_REVENUE &&
      row.reservations >= MIN_ALERT_ROUTE_RESERVATIONS
  );

  return {
    routeRows,
    topRoutes,
    weakRoutes,
    weakestRouteByFill:
      [...weakRouteCandidates].sort(
        (left, right) =>
          right.estimatedImpact - left.estimatedImpact ||
          (left.fillRate ?? 1) - (right.fillRate ?? 1)
      )[0] ?? null,
  };
}

function getAlerts(
  health: HealthMetrics,
  agencies: AgenciesPerformance,
  routes: RoutesPerformance
): CeoAlert[] {
  const alerts: CeoAlert[] = [];

  if (agencies.inactiveToday.length > 0) {
    alerts.push({
      id: "inactive-agencies",
      severity: getAlertSeverity(agencies.inactiveTodayImpact),
      title: `${agencies.inactiveToday.length} agence(s) sans activite aujourd'hui`,
      detail: agencies.inactiveToday
        .slice(0, 3)
        .map((row) => row.agencyName)
        .join(", "),
      impact: agencies.inactiveTodayImpact,
    });
  }

  if (routes.weakestRouteByFill && routes.weakestRouteByFill.fillRate !== null) {
    alerts.push({
      id: "weak-route-fill",
      severity: getAlertSeverity(routes.weakestRouteByFill.estimatedImpact),
      title: `${routes.weakestRouteByFill.routeLabel} sous 50% de remplissage`,
      detail: `${Math.round(
        routes.weakestRouteByFill.fillRate * 100
      )}% de remplissage sur la periode, ${routes.weakestRouteByFill.trips} depart(s) suivis`,
      impact: routes.weakestRouteByFill.estimatedImpact,
    });
  }

  if (
    health.averageLastSevenDaysRevenue >= MIN_ALERT_DAILY_BASELINE &&
    health.revenueToday < health.averageLastSevenDaysRevenue * 0.5
  ) {
    alerts.push({
      id: "revenue-below-average",
      severity: getAlertSeverity(health.revenueDropImpact),
      title: "Le revenu du jour est en baisse",
      detail: "Le revenu du jour est sous 50% de la moyenne des 7 derniers jours.",
      impact: health.revenueDropImpact,
    });
  }

  return sortAlertsByPriority(alerts).slice(0, 3);
}

function getRecommendations(
  companyId: string,
  health: HealthMetrics,
  agencies: AgenciesPerformance,
  routes: RoutesPerformance
): CeoRecommendation[] {
  const recommendations: CeoRecommendation[] = [];

  if (routes.weakestRouteByFill && routes.weakestRouteByFill.fillRate !== null) {
    recommendations.push({
      id: "reduce-weak-route",
      title: "Reduire les departs les plus faibles",
      detail: `${routes.weakestRouteByFill.routeLabel} reste sous le seuil de rentabilite. Regroupez ou reduisez la frequence.`,
      impact: routes.weakestRouteByFill.estimatedImpact,
      actionHref: buildCompanyPath(companyId, "reservations-reseau"),
      actionLabel: "Voir details",
    });
  }

  if (
    agencies.dominantAgency &&
    agencies.dominantAgency.share >= DOMINANT_AGENCY_SHARE
  ) {
    recommendations.push({
      id: "optimize-dominant-agency",
      title: `Renforcer ${agencies.dominantAgency.agencyName}`,
      detail: `${Math.round(
        agencies.dominantAgency.share * 100
      )}% du revenu provient de cette agence. Renforcez capacite, equipe ou acquisition digitale.`,
      impact: 0,
      actionHref: buildCompanyPath(companyId, "agences"),
      actionLabel: "Voir details",
    });
  }

  if (agencies.inactiveToday.length > 0) {
    recommendations.push({
      id: "reactivate-agencies",
      title: "Reactiver les agences inactives",
      detail: "Traitez en priorite les agences sans activite aujourd'hui pour eviter une perte de volume reseau.",
      impact: agencies.inactiveTodayImpact,
      actionHref: buildCompanyPath(companyId, "agences"),
      actionLabel: "Voir details",
    });
  }

  if (health.revenuePeriod > 0 && health.expensesPeriod > health.revenuePeriod * EXPENSES_WATCH_RATIO) {
    recommendations.push({
      id: "watch-expenses",
      title: "Surveiller les depenses du reseau",
      detail: "Le niveau de depenses de la periode est eleve par rapport au revenu genere.",
      impact: safeImpact(health.expensesPeriod - health.revenuePeriod * EXPENSES_WATCH_RATIO),
      actionHref: buildCompanyPath(companyId, "audit-controle"),
      actionLabel: "Voir details",
    });
  } else if (
    health.revenuePeriod > 0 &&
    health.paymentsPeriod < health.revenuePeriod * PAYMENT_CONVERSION_RATIO
  ) {
    recommendations.push({
      id: "watch-cash-conversion",
      title: "Verifier la conversion en encaissement",
      detail: "Le revenu commercial est nettement superieur aux paiements valides sur la periode.",
      impact: safeImpact(health.revenuePeriod - health.paymentsPeriod),
      actionHref: buildCompanyPath(companyId, "finances"),
      actionLabel: "Voir details",
    });
  }

  return [...recommendations]
    .sort(
      (left, right) =>
        right.impact - left.impact || left.title.localeCompare(right.title)
    )
    .slice(0, 3);
}

function buildInsights(
  source: SourceSnapshot,
  period: CeoInsightsPeriod,
  companyId: string
): CeoInsights {
  const meta = getPeriodMeta(period);
  const health = getHealthMetrics(source, meta);
  const agencies = getAgenciesPerformance(source, health, meta);
  const routes = getRoutesAnalysis(source, health, meta);
  const alerts = getAlerts(health, agencies, routes);
  const recommendations = getRecommendations(companyId, health, agencies, routes);

  return {
    loading: source.loading,
    revenueToday: health.revenueToday,
    revenuePeriod: health.revenuePeriod,
    growth: health.growth,
    activeAgencies: agencies.activeAgencies,
    alerts,
    recommendations,
    topAgencies: agencies.topAgencies,
    weakAgencies: agencies.weakAgencies,
    topRoutes: routes.topRoutes,
    weakRoutes: routes.weakRoutes,
  };
}

export function useCeoInsights(
  companyId: string,
  period: CeoInsightsPeriod
): CeoInsights {
  const [source, setSource] = useState<SourceSnapshot>(EMPTY_SOURCE);

  useEffect(() => {
    if (!companyId) {
      setSource({ ...EMPTY_SOURCE, loading: false });
      return;
    }

    let childUnsubscribers: Unsubscribe[] = [];
    const agencies = new Map<string, AgencyMeta>();
    const reservationsByAgency = new Map<string, OperationRecord[]>();
    const parcelsByAgency = new Map<string, OperationRecord[]>();
    const reservationReady = new Set<string>();
    const parcelReady = new Set<string>();
    let payments: PaymentRecord[] = [];
    let expenses: ExpenseRecord[] = [];
    let tripInstances: TripInstanceRecord[] = [];
    let agenciesReady = false;
    let paymentsReady = false;
    let expensesReady = false;
    let tripInstancesReady = false;

    const cleanupChildren = () => {
      childUnsubscribers.forEach((unsubscribe) => unsubscribe());
      childUnsubscribers = [];
      reservationsByAgency.clear();
      parcelsByAgency.clear();
      reservationReady.clear();
      parcelReady.clear();
    };

    const emit = () => {
      const loading =
        !agenciesReady ||
        !paymentsReady ||
        !expensesReady ||
        !tripInstancesReady ||
        reservationReady.size < agencies.size ||
        parcelReady.size < agencies.size;

      setSource({
        loading,
        agencies: Array.from(agencies.values()),
        reservations: Array.from(reservationsByAgency.values()).flat(),
        parcels: Array.from(parcelsByAgency.values()).flat(),
        payments: [...payments],
        expenses: [...expenses],
        tripInstances: [...tripInstances],
      });
    };

    const unsubscribeAgencies = onSnapshot(
      collection(db, "companies", companyId, "agences"),
      (snapshot) => {
        cleanupChildren();
        agencies.clear();
        agenciesReady = true;

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data() as FirestoreRecord;
          agencies.set(docSnap.id, {
            id: docSnap.id,
            name: firstText(data.nom, data.name, data.nomAgence) || "Agence",
          });
        });

        if (agencies.size === 0) {
          emit();
          return;
        }

        emit();

        agencies.forEach((agency) => {
          childUnsubscribers.push(
            onSnapshot(
              collection(db, "companies", companyId, "agences", agency.id, "reservations"),
              (childSnapshot) => {
                reservationsByAgency.set(
                  agency.id,
                  readReservationOperations(agency.id, childSnapshot.docs)
                );
                reservationReady.add(agency.id);
                emit();
              },
              () => {
                reservationsByAgency.set(agency.id, []);
                reservationReady.add(agency.id);
                emit();
              }
            )
          );

          childUnsubscribers.push(
            onSnapshot(
              collection(db, "companies", companyId, "agences", agency.id, "parcels"),
              (childSnapshot) => {
                parcelsByAgency.set(
                  agency.id,
                  readParcelOperations(agency.id, childSnapshot.docs)
                );
                parcelReady.add(agency.id);
                emit();
              },
              () => {
                parcelsByAgency.set(agency.id, []);
                parcelReady.add(agency.id);
                emit();
              }
            )
          );
        });
      },
      () => {
        cleanupChildren();
        agencies.clear();
        agenciesReady = true;
        emit();
      }
    );

    const unsubscribePayments = onSnapshot(
      collection(db, "companies", companyId, "payments"),
      (snapshot) => {
        payments = readPayments(snapshot.docs);
        paymentsReady = true;
        emit();
      },
      () => {
        payments = [];
        paymentsReady = true;
        emit();
      }
    );

    const unsubscribeExpenses = onSnapshot(
      collection(db, "companies", companyId, "expenses"),
      (snapshot) => {
        expenses = readExpenses(snapshot.docs);
        expensesReady = true;
        emit();
      },
      () => {
        expenses = [];
        expensesReady = true;
        emit();
      }
    );

    const unsubscribeTripInstances = onSnapshot(
      collection(db, "companies", companyId, "tripInstances"),
      (snapshot) => {
        tripInstances = readTripInstances(snapshot.docs);
        tripInstancesReady = true;
        emit();
      },
      () => {
        tripInstances = [];
        tripInstancesReady = true;
        emit();
      }
    );

    return () => {
      cleanupChildren();
      unsubscribeAgencies();
      unsubscribePayments();
      unsubscribeExpenses();
      unsubscribeTripInstances();
    };
  }, [companyId]);

  return useMemo(() => buildInsights(source, period, companyId), [source, period, companyId]);
}
