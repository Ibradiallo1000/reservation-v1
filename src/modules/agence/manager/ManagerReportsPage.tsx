import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { format } from "date-fns";
import { Activity, Banknote, Boxes, Download, Ticket, WalletCards } from "lucide-react";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { DateFilterBar } from "./DateFilterBar";
import { useDateFilterContext } from "./DateFilterContext";
import { ActionButton, EmptyState, MetricCard, PageHeader, SectionCard, StandardLayoutWrapper, typography } from "@/ui";
import {
  buildAgencyCashStatementSummary,
  loadAgencyCashStatementCached,
} from "@/modules/agence/cashStatement/agencyCashStatementService";
import type { AgencyCashStatementSummary } from "@/modules/agence/cashStatement/agencyCashStatementTypes";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { listExpenses, type ExpenseDoc } from "@/modules/compagnie/treasury/expenses";
import {
  tripInstanceSeatCapacity,
  tripInstanceTime,
  type TripInstanceDocWithId,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { reservationLinkedSessionId } from "@/modules/agence/guichet/guichetSessionReservationModel";

type ReservationRow = {
  id: string;
  date: string;
  occurredAt: Date | null;
  amount: number;
  seats: number;
  online: boolean;
  sold: boolean;
  tripInstanceId: string;
};

type ShipmentRow = {
  id: string;
  amount: number;
  createdAt: Date | null;
};

type CourierSessionRow = {
  id: string;
  status: string;
  date: Date | null;
};

type ShiftRow = {
  id: string;
  status: string;
  date: Date | null;
};

type ReportsData = {
  cashSummary: AgencyCashStatementSummary | null;
  reservations: ReservationRow[];
  shipments: ShipmentRow[];
  courierSessions: CourierSessionRow[];
  shifts: ShiftRow[];
  tripInstances: TripInstanceDocWithId[];
  expenses: Array<ExpenseDoc & { id: string }>;
};

type FirestoreResultName =
  | "cashStatement"
  | "guichetSessions"
  | "guichetReservations"
  | "onlineTicketValidatedReservations"
  | "onlineUpdatedReservations"
  | "shipments"
  | "courierSessions"
  | "cashSessions"
  | "tripInstances"
  | "expenses";

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const maybeTimestamp = value as { toDate?: () => Date; seconds?: number };
  if (typeof maybeTimestamp.toDate === "function") {
    const date = maybeTimestamp.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof maybeTimestamp.seconds === "number") {
    const date = new Date(maybeTimestamp.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function inRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= start.getTime() && time <= end.getTime();
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isOnlineReservation(raw: Record<string, unknown>): boolean {
  const reservationMap =
    typeof raw.reservation === "object" && raw.reservation !== null
      ? (raw.reservation as Record<string, unknown>)
      : {};
  const canal = normalizeText(
    raw.canal ??
      raw.channel ??
      raw.source ??
      raw.origin ??
      raw.paymentChannel ??
      reservationMap.channel
  );
  return (
    raw.online === true ||
    raw.isOnline === true ||
    canal === "online" ||
    canal === "en_ligne" ||
    canal === "web" ||
    canal === "public" ||
    canal === "reservation_en_ligne" ||
    canal === "site_web" ||
    canal === "mobile" ||
    canal === "app"
  );
}

function isGuichetReservation(raw: Record<string, unknown>): boolean {
  const canal = normalizeText(raw.canal ?? raw.channel ?? raw.source ?? raw.origin ?? raw.paymentChannel);
  return canal === "guichet";
}

function isCancelled(raw: Record<string, unknown>): boolean {
  const status = normalizeText(raw.statut ?? raw.status ?? raw.reservationStatus);
  return ["annule", "cancelled", "canceled", "refuse", "rejected", "en_attente_paiement"].includes(status);
}

function isConfirmedReservation(raw: Record<string, unknown>): boolean {
  const status = normalizeText(raw.statut ?? raw.status ?? raw.reservationStatus);
  return (
    raw.confirmed === true ||
    raw.ticketValidated === true ||
    raw.paid === true ||
    ["confirme", "confirmed", "paye", "paid", "validé", "valide"].includes(status)
  );
}

function reservationSaleDate(raw: Record<string, unknown>, online: boolean): Date | null {
  if (online) {
    return (
      toDateOrNull(raw.ticketValidatedAt) ??
      toDateOrNull(raw.updatedAt) ??
      toDateOrNull(raw.paymentDate) ??
      toDateOrNull(raw.createdAt)
    );
  }
  return (
    toDateOrNull(raw.createdAt) ??
    toDateOrNull(raw.saleDate) ??
    toDateOrNull(raw.ticketValidatedAt) ??
    toDateOrNull(raw.updatedAt)
  );
}

function mapReservationDoc(id: string, raw: Record<string, unknown>, forcedOnline?: boolean): ReservationRow {
  const online = forcedOnline ?? isOnlineReservation(raw);
  const confirmed = isConfirmedReservation(raw);
  return {
    id,
    date: String(raw.date ?? ""),
    occurredAt: reservationSaleDate(raw, online),
    amount: reservationAmount(raw),
    seats: reservationSeats(raw),
    online,
    sold: !isCancelled(raw) && (online ? confirmed : isGuichetReservation(raw)),
    tripInstanceId: String(raw.tripInstanceId ?? "").trim(),
  };
}

function mergeReservations(rows: ReservationRow[]): ReservationRow[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function fulfilledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

function logRejectedSources(
  entries: Array<{ name: FirestoreResultName; result: PromiseSettledResult<unknown> }>
): FirestoreResultName[] {
  const rejected = entries.filter((entry) => entry.result.status === "rejected");
  if (rejected.length > 0) {
    console.warn(
      "[ManagerReports] Sources indisponibles",
      rejected.map((entry) => ({
        source: entry.name,
        error: entry.result.status === "rejected" ? entry.result.reason : null,
      }))
    );
  }
  return rejected.map((entry) => entry.name);
}

function reservationAmount(raw: Record<string, unknown>): number {
  const payment = raw.payment as { amount?: unknown } | undefined;
  return Math.max(
    0,
    Number(raw.amount ?? raw.montant ?? raw.totalAmount ?? raw.totalPrice ?? payment?.amount ?? raw.price ?? 0) || 0
  );
}

function reservationSeats(raw: Record<string, unknown>): number {
  return Math.max(
    1,
    Number(raw.seatsGo ?? 0) + Number(raw.seatsReturn ?? 0) ||
      Number(raw.seats ?? raw.places ?? raw.nbPlaces ?? 1) ||
      1
  );
}

function expenseDate(expense: ExpenseDoc): Date | null {
  return (
    toDateOrNull(expense.paidAt) ??
    toDateOrNull(expense.expenseDate) ??
    toDateOrNull(expense.createdAt)
  );
}

function money(value: number, currency = "XOF"): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value) || 0));
}

function signedMoney(value: number, currency = "XOF"): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${money(Math.abs(value), currency)}`;
}

function isDeparted(trip: TripInstanceDocWithId): boolean {
  const status = normalizeText((trip as any).status);
  const statutMetier = normalizeText((trip as any).statutMetier);
  return (
    status === "departed" ||
    status === "arrived" ||
    status === "done" ||
    statutMetier === "en_transit" ||
    statutMetier === "parti" ||
    statutMetier === "termine" ||
    toDateOrNull((trip as any).departureConfirmedAt) != null ||
    toDateOrNull((trip as any).departedAt) != null
  );
}

function scheduledAt(trip: TripInstanceDocWithId): Date | null {
  const date = String((trip as any).date ?? "").trim();
  const time = tripInstanceTime(trip);
  if (!date || !time) return null;
  return toDateOrNull(`${date}T${time}:00`);
}

const emptyData: ReportsData = {
  cashSummary: null,
  reservations: [],
  shipments: [],
  courierSessions: [],
  shifts: [],
  tripInstances: [],
  expenses: [],
};

export default function ManagerReportsPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const dateFilter = useDateFilterContext();
  const { start, end } = dateFilter.range;
  const currency = "XOF";

  const [data, setData] = useState<ReportsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setData(emptyData);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      const startKey = dateKey(start);
      const endKey = dateKey(end);

      try {
        const [
          cashResult,
          guichetSessionsResult,
          guichetReservationsResult,
          onlineTicketValidatedResult,
          onlineUpdatedResult,
          shipmentsResult,
          courierSessionsResult,
          shiftsResult,
          tripInstancesResult,
          expensesResult,
        ] = await Promise.allSettled([
          loadAgencyCashStatementCached(
            { companyId, agencyId, from: start, to: end },
            { mode: "manager", includeLegacyLedger: false, tolerateSecondarySourceErrors: true, force: true }
          ),
          getDocs(
            query(
              collection(db, "companies", companyId, "agences", agencyId, "shifts"),
              limit(800)
            )
          ),
          getDocs(
            query(
              collection(db, "companies", companyId, "agences", agencyId, "reservations"),
              where("canal", "==", "guichet"),
              limit(1500)
            )
          ),
          getDocs(
            query(
              collection(db, "companies", companyId, "agences", agencyId, "reservations"),
              where("ticketValidatedAt", ">=", start),
              where("ticketValidatedAt", "<=", end),
              limit(800)
            )
          ),
          getDocs(
            query(
              collection(db, "companies", companyId, "agences", agencyId, "reservations"),
              where("updatedAt", ">=", start),
              where("updatedAt", "<=", end),
              limit(800)
            )
          ),
          getDocs(query(shipmentsRef(db, companyId), where("originAgencyId", "==", agencyId), limit(800))),
          getDocs(query(courierSessionsRef(db, companyId, agencyId), limit(400))),
          getDocs(
            query(
              collection(db, "companies", companyId, "agences", agencyId, "shifts"),
              where("status", "in", ["closed", "validated", "validated_agency"]),
              limit(500)
            )
          ),
          getDocs(
            query(
              collection(db, "companies", companyId, "tripInstances"),
              where("agencyId", "==", agencyId),
              where("date", ">=", startKey),
              where("date", "<=", endKey),
              limit(500)
            )
          ),
          listExpenses(companyId, { agencyId, status: "paid", limitCount: 300 }),
        ]);

        if (cancelled) return;

        const cashSummary =
          cashResult.status === "fulfilled"
            ? buildAgencyCashStatementSummary(cashResult.value, "all")
            : null;

        const guichetSessionIds =
          guichetSessionsResult.status === "fulfilled"
            ? new Set(
                guichetSessionsResult.value.docs
                  .map((docSnap) => {
                    const raw = docSnap.data() as Record<string, unknown>;
                    const sessionDate =
                      toDateOrNull(raw.closedAt) ??
                      toDateOrNull(raw.endAt) ??
                      toDateOrNull(raw.endTime) ??
                      toDateOrNull(raw.validatedAt) ??
                      toDateOrNull(raw.startAt) ??
                      toDateOrNull(raw.openedAt) ??
                      toDateOrNull(raw.createdAt);
                    const status = normalizeText(raw.status);
                    const isOpen = status === "active" || status === "paused";
                    return inRange(sessionDate, start, end) || isOpen ? docSnap.id : "";
                  })
                  .filter(Boolean)
              )
            : new Set<string>();

        const guichetReservations =
          guichetReservationsResult.status === "fulfilled"
            ? guichetReservationsResult.value.docs
                .map((docSnap) => {
                  const raw: Record<string, unknown> & { id: string } = {
                    id: docSnap.id,
                    ...(docSnap.data() as Record<string, unknown>),
                  };
                  return {
                    linkedSessionId: reservationLinkedSessionId(raw),
                    row: mapReservationDoc(docSnap.id, raw, false),
                  };
                })
                .filter(({ linkedSessionId, row }) => {
                  return row.sold && (guichetSessionIds.has(linkedSessionId) || inRange(row.occurredAt, start, end));
                })
                .map(({ row }) => row)
            : [];

        const onlineReservations = mergeReservations([
          ...fulfilledValue(onlineTicketValidatedResult, { docs: [] } as any).docs.map((docSnap: any) =>
            mapReservationDoc(docSnap.id, { id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) })
          ),
          ...fulfilledValue(onlineUpdatedResult, { docs: [] } as any).docs.map((docSnap: any) =>
            mapReservationDoc(docSnap.id, { id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) })
          ),
        ]).filter((row) => row.sold && row.online && inRange(row.occurredAt, start, end));

        const reservations = mergeReservations([...guichetReservations, ...onlineReservations]);

        const shipments =
          shipmentsResult.status === "fulfilled"
            ? shipmentsResult.value.docs
                .map((docSnap): ShipmentRow => {
                  const raw = docSnap.data() as Record<string, unknown>;
                  const createdAt = toDateOrNull(raw.createdAt) ?? toDateOrNull(raw.updatedAt);
                  return {
                    id: docSnap.id,
                    createdAt,
                    amount:
                      Math.max(0, Number(raw.transportFee ?? 0) || 0) +
                      Math.max(0, Number(raw.insuranceAmount ?? 0) || 0),
                  };
                })
                .filter((row) => inRange(row.createdAt, start, end))
            : [];

        const courierSessions =
          courierSessionsResult.status === "fulfilled"
            ? courierSessionsResult.value.docs
                .map((docSnap): CourierSessionRow => {
                  const raw = docSnap.data() as Record<string, unknown>;
                  return {
                    id: docSnap.id,
                    status: String(raw.status ?? ""),
                    date: toDateOrNull(raw.closedAt) ?? toDateOrNull(raw.startAt) ?? toDateOrNull(raw.createdAt),
                  };
                })
                .filter((row) => inRange(row.date, start, end) || normalizeText(row.status) === "active")
            : [];

        const shifts =
          shiftsResult.status === "fulfilled"
            ? shiftsResult.value.docs
                .map((docSnap): ShiftRow => {
                  const raw = docSnap.data() as Record<string, unknown>;
                  return {
                    id: docSnap.id,
                    status: String(raw.status ?? ""),
                    date: toDateOrNull(raw.endTime) ?? toDateOrNull(raw.closedAt) ?? toDateOrNull(raw.startTime) ?? toDateOrNull(raw.createdAt),
                  };
                })
                .filter((row) => inRange(row.date, start, end))
            : [];

        const tripInstances =
          tripInstancesResult.status === "fulfilled"
            ? tripInstancesResult.value.docs.map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as any),
              } as TripInstanceDocWithId))
            : [];

        const expenses =
          expensesResult.status === "fulfilled"
            ? expensesResult.value
                .map((expense) => ({ ...expense, id: (expense as any).id ?? "" }))
                .filter((expense) => inRange(expenseDate(expense), start, end))
            : [];

        setData({
          cashSummary,
          reservations,
          shipments,
          courierSessions,
          shifts,
          tripInstances,
          expenses,
        });

        if (
          cashResult.status === "rejected" ||
          guichetSessionsResult.status === "rejected" ||
          guichetReservationsResult.status === "rejected" ||
          onlineTicketValidatedResult.status === "rejected" ||
          onlineUpdatedResult.status === "rejected" ||
          shipmentsResult.status === "rejected" ||
          courierSessionsResult.status === "rejected" ||
          shiftsResult.status === "rejected" ||
          tripInstancesResult.status === "rejected" ||
          expensesResult.status === "rejected"
        ) {
          const rejected = logRejectedSources([
            { name: "cashStatement", result: cashResult },
            { name: "guichetSessions", result: guichetSessionsResult },
            { name: "guichetReservations", result: guichetReservationsResult },
            { name: "onlineTicketValidatedReservations", result: onlineTicketValidatedResult },
            { name: "onlineUpdatedReservations", result: onlineUpdatedResult },
            { name: "shipments", result: shipmentsResult },
            { name: "courierSessions", result: courierSessionsResult },
            { name: "cashSessions", result: shiftsResult },
            { name: "tripInstances", result: tripInstancesResult },
            { name: "expenses", result: expensesResult },
          ]);
          const criticalSources: FirestoreResultName[] = [
            "cashStatement",
            "guichetSessions",
            "guichetReservations",
            "onlineTicketValidatedReservations",
            "onlineUpdatedReservations",
          ];
          setError(
            rejected.some((source) => criticalSources.includes(source))
              ? "Certaines sources critiques de synthèse sont indisponibles. Les KPI affichés utilisent les données accessibles."
              : null
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [agencyId, companyId, end, start]);

  const report = useMemo(() => {
    const guichetReservations = data.reservations.filter((row) => !row.online);
    const onlineReservations = data.reservations.filter((row) => row.online);
    const guichetTickets = guichetReservations.reduce((sum, row) => sum + row.seats, 0);
    const onlineTickets = onlineReservations.reduce((sum, row) => sum + row.seats, 0);
    const guichetAmount = guichetReservations.reduce((sum, row) => sum + row.amount, 0);
    const onlineAmount = onlineReservations.reduce((sum, row) => sum + row.amount, 0);
    const courierAmount = data.shipments.reduce((sum, row) => sum + row.amount, 0);
    const expensesAmount = data.expenses.reduce((sum, row) => sum + Math.max(0, Number(row.amount ?? 0) || 0), 0);
    const transferRows = data.cashSummary?.rows.filter((row) => row.category === "transfer") ?? [];
    const transferAmount = transferRows.reduce((sum, row) => sum + row.exit, 0);
    const totalCapacity = data.tripInstances.reduce((sum, trip) => sum + Math.max(0, tripInstanceSeatCapacity(trip)), 0);
    const seatsByTrip = new Map<string, number>();
    for (const reservation of data.reservations) {
      if (!reservation.tripInstanceId) continue;
      seatsByTrip.set(
        reservation.tripInstanceId,
        (seatsByTrip.get(reservation.tripInstanceId) ?? 0) + reservation.seats
      );
    }
    const soldSeatsWithTrip = data.tripInstances.reduce((sum, trip) => sum + (seatsByTrip.get(trip.id) ?? 0), 0);
    const fillRate = totalCapacity > 0 ? soldSeatsWithTrip / totalCapacity : 0;
    const now = new Date();
    const lateDepartures = data.tripInstances.filter((trip) => {
      const plannedAt = scheduledAt(trip);
      return plannedAt != null && plannedAt.getTime() < now.getTime() && !isDeparted(trip);
    }).length;

    return {
      totalEntries: data.cashSummary?.totalEntries ?? 0,
      totalExits: data.cashSummary?.totalExits ?? 0,
      net: data.cashSummary?.net ?? 0,
      currentBalance: data.cashSummary?.currentBalance ?? 0,
      guichetTickets,
      guichetAmount,
      onlineTickets,
      onlineAmount,
      departures: data.tripInstances.length,
      lateDepartures,
      fillRate,
      shipments: data.shipments.length,
      courierAmount,
      courierSessionsActive: data.courierSessions.filter((row) => normalizeText(row.status) === "active").length,
      courierSessionsClosed: data.courierSessions.filter((row) => ["closed", "validated_agency", "validated"].includes(normalizeText(row.status))).length,
      expenses: data.expenses.length,
      expensesAmount,
      transfers: transferRows.length,
      transferAmount,
      cashSessionsClosed: data.shifts.filter((row) => normalizeText(row.status) === "closed").length,
      cashSessionsValidated: data.shifts.filter((row) => ["validated", "validated_agency"].includes(normalizeText(row.status))).length,
    };
  }, [data]);

  const handleExportCSV = () => {
    const rows = [
      ["Indicateur", "Valeur"],
      ["Total recettes", String(report.totalEntries)],
      ["Total sorties", String(report.totalExits)],
      ["Net période", String(report.net)],
      ["Solde caisse actuel", String(report.currentBalance)],
      ["Billets guichet", String(report.guichetTickets)],
      ["Montant guichet", String(report.guichetAmount)],
      ["Billets en ligne", String(report.onlineTickets)],
      ["Montant en ligne", String(report.onlineAmount)],
      ["Départs période", String(report.departures)],
      ["Départs en retard", String(report.lateDepartures)],
      ["Courriers enregistrés", String(report.shipments)],
      ["Montant courrier", String(report.courierAmount)],
      ["Dépenses période", String(report.expenses)],
      ["Montant dépenses", String(report.expensesAmount)],
      ["Versements période", String(report.transfers)],
      ["Montant versements", String(report.transferAmount)],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `synthese-activite-agence-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <StandardLayoutWrapper>
        <p className={typography.muted}>Chargement de la synthèse d'activité…</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Rapports"
        subtitle="Synthèse d'activité de l'agence"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <DateFilterBar
              preset={dateFilter.preset}
              onPresetChange={dateFilter.setPreset}
              customStart={dateFilter.customStart}
              customEnd={dateFilter.customEnd}
              onCustomStartChange={dateFilter.setCustomStart}
              onCustomEndChange={dateFilter.setCustomEnd}
            />
            <ActionButton onClick={handleExportCSV} variant="secondary">
              <Download className="h-4 w-4" />
              Export CSV
            </ActionButton>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          {error}
        </div>
      )}

      <SectionCard title="Vue d'ensemble" icon={Activity}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <MetricCard label="Total recettes" value={money(report.totalEntries, currency)} icon={Banknote} valueColorVar="#059669" />
          <MetricCard label="Total sorties" value={money(report.totalExits, currency)} icon={WalletCards} valueColorVar="#b91c1c" />
          <MetricCard label="Net période" value={signedMoney(report.net, currency)} icon={Activity} valueColorVar={report.net >= 0 ? "#059669" : "#b91c1c"} />
          <MetricCard label="Solde caisse actuel" value={money(report.currentBalance, currency)} icon={Banknote} valueColorVar="#2563eb" />
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Billetterie" icon={Ticket}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SmallMetric label="Billets guichet" value={report.guichetTickets} />
            <SmallMetric label="Montant guichet" value={money(report.guichetAmount, currency)} />
            <SmallMetric label="Billets en ligne" value={report.onlineTickets} />
            <SmallMetric label="Montant en ligne" value={money(report.onlineAmount, currency)} />
            <SmallMetric label="Départs période" value={report.departures} />
            <SmallMetric label="Départs en retard" value={report.lateDepartures} tone={report.lateDepartures > 0 ? "warning" : "neutral"} />
            <SmallMetric label="Taux remplissage moyen" value={`${Math.round(report.fillRate * 100)}%`} />
          </div>
        </SectionCard>

        <SectionCard title="Activité courrier" icon={Boxes}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SmallMetric label="Courriers enregistrés" value={report.shipments} />
            <SmallMetric label="Montant courrier" value={money(report.courierAmount, currency)} />
            <SmallMetric label="Sessions actives" value={report.courierSessionsActive} />
            <SmallMetric label="Sessions clôturées/validées" value={report.courierSessionsClosed} />
          </div>
        </SectionCard>

        <SectionCard title="Activité caisse" icon={WalletCards}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SmallMetric label="Dépenses période" value={report.expenses} />
            <SmallMetric label="Montant dépenses" value={money(report.expensesAmount, currency)} />
            <SmallMetric label="Versements période" value={report.transfers} />
            <SmallMetric label="Montant versements" value={money(report.transferAmount, currency)} />
            <SmallMetric label="Sessions clôturées" value={report.cashSessionsClosed} />
            <SmallMetric label="Sessions validées" value={report.cashSessionsValidated} />
          </div>
        </SectionCard>
      </div>

      {data.reservations.length === 0 && data.shipments.length === 0 && data.tripInstances.length === 0 && (
        <SectionCard title="Période">
          <EmptyState message="Aucune activité opérationnelle trouvée sur cette période." />
        </SectionCard>
      )}
    </StandardLayoutWrapper>
  );
}

function SmallMetric({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30"
          : "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900"
      }
    >
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}
