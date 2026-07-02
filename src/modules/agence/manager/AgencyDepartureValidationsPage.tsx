import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Eye, Route, Users } from "lucide-react";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { EmptyState, PageHeader, SectionCard } from "@/ui";
import { listBoardingTripAssignmentsForDate } from "@/modules/agence/planning/tripAssignmentService";
import { buildTripInstanceId } from "@/modules/compagnie/tripInstances/tripInstanceService";
import {
  tripInstanceArrival,
  tripInstanceDeparture,
  tripInstanceSeatCapacity,
  tripInstanceTime,
  type TripInstanceDocWithId,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";

type WeeklyTripLite = {
  id: string;
  departure: string;
  arrival: string;
  active: boolean;
  horaires: Record<string, string[]>;
  places?: number;
  seats?: number;
  capacity?: number;
  capacitySeats?: number;
  seatCapacity?: number;
  price?: number;
};

type ReservationGroup = {
  reservations: number;
  soldSeats: number;
  boardedSeats: number;
  absentSeats: number;
  amount: number;
};

type DepartureStatus = "planned" | "open" | "departed" | "done" | "late";

type DepartureRow = {
  key: string;
  agencyId: string;
  date: string;
  heure: string;
  departure: string;
  arrival: string;
  tripId?: string;
  tripInstanceId?: string;
  assignmentId?: string;
  assignmentStatus: "planned" | "validated";
  status: DepartureStatus;
  statusLabel: string;
  delayMinutes: number;
  soldSeats: number;
  capacity: number;
  boardedSeats: number;
  absentSeats: number;
  pendingSeats: number;
  fillRate: number;
  estimatedAmount: number;
  estimatedLoss: number;
};

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateFrShort(date: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

function weekdayFRFromISO(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
}

function normalizeKeyPart(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function toBusinessKey(date: string, heure: string, departure: string, arrival: string): string {
  return `${normalizeKeyPart(date)}|${normalizeKeyPart(heure)}|${normalizeKeyPart(departure)}|${normalizeKeyPart(arrival)}`;
}

function numberOrUndefined(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function weeklyTripCapacity(trip: WeeklyTripLite): number {
  return Number(
    trip.places ??
      trip.seats ??
      trip.capacitySeats ??
      trip.seatCapacity ??
      trip.capacity ??
      0
  ) || 0;
}

function tripInstanceCapacity(trip: TripInstanceDocWithId | null | undefined): number {
  if (!trip) return 0;
  return tripInstanceSeatCapacity(trip);
}

function statusFromWorkflow(statusRaw: unknown, scheduledAt: Date | null): {
  status: DepartureStatus;
  label: string;
  delayMinutes: number;
} {
  const status = String(statusRaw ?? "").trim().toUpperCase();
  const isDeparted = status === "DEPARTED";
  const isDone = status === "CLOSED" || status === "DONE" || status === "TERMINATED";
  const isOpen = status === "OPEN";
  const now = new Date();
  const delayMinutes =
    scheduledAt && !isDeparted && !isDone
      ? Math.max(0, Math.floor((now.getTime() - scheduledAt.getTime()) / 60000))
      : 0;

  if (isDeparted) return { status: "departed", label: "Parti", delayMinutes: 0 };
  if (isDone) return { status: "done", label: "Terminé", delayMinutes: 0 };
  if (delayMinutes > 0) return { status: "late", label: "En retard", delayMinutes };
  if (isOpen) return { status: "open", label: "Ouvert", delayMinutes: 0 };
  return { status: "planned", label: "Planifié", delayMinutes: 0 };
}

function statusClasses(status: DepartureStatus): string {
  if (status === "late") return "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200";
  if (status === "open") return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
  if (status === "departed") return "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200";
  if (status === "done") return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
  return "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
}

function money(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(value) || 0));
}

function addDaysISO(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalISO(d);
}

const AgencyDepartureValidationsPage: React.FC = () => {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? null;
  const agencyId = user?.agencyId ?? null;
  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const isChefAgence = rolesArr.includes("chefAgence") || rolesArr.includes("chefagence");

  const today = toLocalISO(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [rows, setRows] = useState<DepartureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRow, setSelectedRow] = useState<DepartureRow | null>(null);

  const loadDepartures = useCallback(async () => {
    if (!companyId || !agencyId || !isChefAgence) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const dayName = weekdayFRFromISO(selectedDate);
      const weeklySnap = await getDocs(collection(db, "companies", companyId, "agences", agencyId, "weeklyTrips"));
      const weeklyTrips = new Map<string, WeeklyTripLite>();

      for (const docSnap of weeklySnap.docs) {
        const data = docSnap.data() as Record<string, unknown>;
        weeklyTrips.set(docSnap.id, {
          id: docSnap.id,
          departure: String(data.departure ?? data.departureCity ?? ""),
          arrival: String(data.arrival ?? data.arrivalCity ?? ""),
          active: data.active !== false && String(data.status ?? "ACTIVE").toUpperCase() !== "INACTIVE",
          horaires: Object.fromEntries(
            Object.entries((data.horaires as Record<string, unknown>) ?? {}).map(([day, values]) => [
              day,
              Array.isArray(values) ? values.map(String).filter(Boolean) : [],
            ])
          ),
          places: numberOrUndefined(data.places),
          seats: numberOrUndefined(data.seats),
          capacity: numberOrUndefined(data.capacity),
          capacitySeats: numberOrUndefined(data.capacitySeats),
          seatCapacity: numberOrUndefined(data.seatCapacity),
          price: numberOrUndefined(data.price),
        });
      }

      const assignments = await listBoardingTripAssignmentsForDate(companyId, agencyId, selectedDate);
      const assignmentsBySlot = new Map<string, (typeof assignments)[number] & { id?: string }>();
      for (const assignment of assignments) {
        assignmentsBySlot.set(toBusinessKey(assignment.date, assignment.heure, assignment.tripId, ""), assignment);
      }

      const tripInstancesById = new Map<string, TripInstanceDocWithId>();
      const tripInstancesByRoute = new Map<string, TripInstanceDocWithId>();
      try {
        const tripSnap = await getDocs(
          query(
            collection(db, "companies", companyId, "tripInstances"),
            where("agencyId", "==", agencyId),
            where("date", "==", selectedDate)
          )
        );
        for (const docSnap of tripSnap.docs) {
          const trip = { id: docSnap.id, ...(docSnap.data() as any) } as TripInstanceDocWithId;
          tripInstancesById.set(docSnap.id, trip);
          tripInstancesByRoute.set(
            toBusinessKey(
              selectedDate,
              tripInstanceTime(trip),
              tripInstanceDeparture(trip),
              tripInstanceArrival(trip)
            ),
            trip
          );
        }
      } catch {
        /* The page stays usable with planning + reservations if tripInstances are unavailable. */
      }

      const departureStatusById = new Map<string, string>();
      try {
        const departuresSnap = await getDocs(collection(db, "companies", companyId, "agences", agencyId, "departures"));
        for (const docSnap of departuresSnap.docs) {
          const data = docSnap.data() as Record<string, unknown>;
          if (String(data.date ?? selectedDate) !== selectedDate) continue;
          departureStatusById.set(docSnap.id, String(data.tripStatus ?? data.status ?? ""));
        }
      } catch {
        /* Status falls back to planned/late. */
      }

      const reservationsByRoute = new Map<string, ReservationGroup>();
      try {
        const reservationsSnap = await getDocs(
          query(collection(db, "companies", companyId, "agences", agencyId, "reservations"), where("date", "==", selectedDate))
        );
        const excludedStatuses = new Set([
          "annulé",
          "annule",
          "refusé",
          "refuse",
          "cancelled",
          "canceled",
          "en_attente_paiement",
        ]);

        for (const docSnap of reservationsSnap.docs) {
          const data = docSnap.data() as Record<string, unknown>;
          const status = String(data.statut ?? data.status ?? "").trim().toLowerCase();
          if (excludedStatuses.has(status)) continue;

          const departure = String(data.departure ?? data.depart ?? "").trim();
          const arrival = String(data.arrival ?? data.arrivee ?? "").trim();
          const heure = String(data.heure ?? data.time ?? "").trim();
          if (!departure || !arrival || !heure) continue;

          const seats = Math.max(1, Number(data.seatsGo ?? data.places ?? data.seats ?? 1) || 1);
          const amount = Math.max(0, Number(data.amount ?? data.montant ?? data.totalPrice ?? data.price ?? 0) || 0);
          const boardingStatus = String(data.boardingStatus ?? "").trim().toLowerCase();
          const statutEmbarquement = String(data.statutEmbarquement ?? "").trim().toLowerCase();
          const isBoarded = boardingStatus === "boarded" || statutEmbarquement === "embarqué" || statutEmbarquement === "embarque";
          const isAbsent = boardingStatus === "no_show" || statutEmbarquement === "absent";
          const key = toBusinessKey(selectedDate, heure, departure, arrival);
          const group = reservationsByRoute.get(key) ?? {
            reservations: 0,
            soldSeats: 0,
            boardedSeats: 0,
            absentSeats: 0,
            amount: 0,
          };
          group.reservations += 1;
          group.soldSeats += seats;
          group.amount += amount;
          if (isBoarded) group.boardedSeats += seats;
          if (isAbsent) group.absentSeats += seats;
          reservationsByRoute.set(key, group);
        }
      } catch {
        /* Reservations are secondary for supervision; cards still show planning. */
      }

      const rowMap = new Map<string, DepartureRow>();
      const addRow = (params: {
        weeklyTrip?: WeeklyTripLite;
        date: string;
        heure: string;
        departure: string;
        arrival: string;
        tripId?: string;
        tripInstance?: TripInstanceDocWithId | null;
        assignment?: ((typeof assignments)[number] & { id?: string }) | null;
      }) => {
        const routeKey = toBusinessKey(params.date, params.heure, params.departure, params.arrival);
        const deterministicTripInstanceId = params.tripId ? buildTripInstanceId(params.tripId, params.date, params.heure) : undefined;
        const tripInstance = params.tripInstance ?? (deterministicTripInstanceId ? tripInstancesById.get(deterministicTripInstanceId) : null);
        const tripInstanceId = tripInstance?.id ?? deterministicTripInstanceId;
        const reservationGroup = reservationsByRoute.get(routeKey) ?? {
          reservations: 0,
          soldSeats: 0,
          boardedSeats: 0,
          absentSeats: 0,
          amount: 0,
        };
        const capacity = Math.max(0, params.weeklyTrip ? weeklyTripCapacity(params.weeklyTrip) : tripInstanceCapacity(tripInstance));
        const scheduledAt = new Date(`${params.date}T${params.heure || "00:00"}:00`);
        const status = statusFromWorkflow(tripInstanceId ? departureStatusById.get(tripInstanceId) : "", scheduledAt);
        const fillRate = capacity > 0 ? Math.max(0, Math.min(1, reservationGroup.soldSeats / capacity)) : 0;
        const averagePrice =
          reservationGroup.soldSeats > 0
            ? reservationGroup.amount / reservationGroup.soldSeats
            : Math.max(0, Number(params.weeklyTrip?.price ?? (tripInstance as any)?.price ?? 0) || 0);

        rowMap.set(routeKey, {
          key: routeKey,
          agencyId,
          date: params.date,
          heure: params.heure,
          departure: params.departure,
          arrival: params.arrival,
          tripId: params.tripId,
          tripInstanceId,
          assignmentId: params.assignment?.id,
          assignmentStatus: params.assignment?.status === "validated" ? "validated" : "planned",
          status: status.status,
          statusLabel: status.label,
          delayMinutes: status.delayMinutes,
          soldSeats: reservationGroup.soldSeats,
          capacity,
          boardedSeats: reservationGroup.boardedSeats,
          absentSeats: reservationGroup.absentSeats,
          pendingSeats: Math.max(0, reservationGroup.soldSeats - reservationGroup.boardedSeats - reservationGroup.absentSeats),
          fillRate,
          estimatedAmount: reservationGroup.amount,
          estimatedLoss: Math.max(0, Math.round((capacity - reservationGroup.soldSeats) * averagePrice)),
        });
      };

      for (const trip of weeklyTrips.values()) {
        if (!trip.active) continue;
        const hours = [...(trip.horaires[dayName] ?? [])].map(String).filter(Boolean).sort();
        for (const heure of hours) {
          const tripInstanceId = buildTripInstanceId(trip.id, selectedDate, heure);
          const assignment = assignmentsBySlot.get(toBusinessKey(selectedDate, heure, trip.id, "")) ?? null;
          addRow({
            weeklyTrip: trip,
            date: selectedDate,
            heure,
            departure: trip.departure,
            arrival: trip.arrival,
            tripId: trip.id,
            tripInstance: tripInstancesById.get(tripInstanceId) ?? tripInstancesByRoute.get(toBusinessKey(selectedDate, heure, trip.departure, trip.arrival)) ?? null,
            assignment,
          });
        }
      }

      for (const trip of tripInstancesById.values()) {
        const departure = tripInstanceDeparture(trip);
        const arrival = tripInstanceArrival(trip);
        const heure = tripInstanceTime(trip);
        if (!departure || !arrival || !heure) continue;
        const key = toBusinessKey(selectedDate, heure, departure, arrival);
        if (rowMap.has(key)) continue;
        addRow({
          date: selectedDate,
          heure,
          departure,
          arrival,
          tripId: String((trip as any).weeklyTripId ?? (trip as any).tripId ?? "") || undefined,
          tripInstance: trip,
        });
      }

      const result = Array.from(rowMap.values()).sort((left, right) => {
        const byTime = left.heure.localeCompare(right.heure);
        if (byTime !== 0) return byTime;
        return `${left.departure} ${left.arrival}`.localeCompare(`${right.departure} ${right.arrival}`);
      });
      setRows(result);
    } finally {
      setLoading(false);
    }
  }, [agencyId, companyId, isChefAgence, selectedDate]);

  useEffect(() => {
    void loadDepartures();
  }, [loadDepartures]);

  const summary = useMemo(() => {
    return {
      total: rows.length,
      late: rows.filter((row) => row.status === "late").length,
      open: rows.filter((row) => row.status === "open").length,
      departed: rows.filter((row) => row.status === "departed" || row.status === "done").length,
    };
  }, [rows]);

  if (!isChefAgence) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
        Accès refusé : cette page est réservée au chef d'agence.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suivi des départs"
        subtitle="Suivi des départs du jour, retards et embarquements"
      />

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">Départs</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{summary.total}</p>
            </div>
            <div className="rounded-xl bg-red-50 p-3 dark:bg-red-950/30">
              <p className="text-xs text-red-600 dark:text-red-300">Retards</p>
              <p className="text-lg font-bold text-red-700 dark:text-red-200">{summary.late}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/30">
              <p className="text-xs text-emerald-600 dark:text-emerald-300">Ouverts</p>
              <p className="text-lg font-bold text-emerald-700 dark:text-emerald-200">{summary.open}</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30">
              <p className="text-xs text-blue-600 dark:text-blue-300">Partis</p>
              <p className="text-lg font-bold text-blue-700 dark:text-blue-200">{summary.departed}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
            >
              <ArrowLeft className="h-4 w-4" />
              Précédent
            </button>
            <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <CalendarDays className="h-4 w-4" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value || today)}
                className="bg-transparent outline-none"
              />
            </label>
            <button
              type="button"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
            >
              Suivant
              <ArrowRight className="h-4 w-4" />
            </button>
            {selectedDate !== today && (
              <button
                type="button"
                className="h-10 rounded-xl bg-orange-600 px-3 text-sm font-semibold text-white hover:bg-orange-700"
                onClick={() => setSelectedDate(today)}
              >
                Aujourd'hui
              </button>
            )}
          </div>
        </div>
      </section>

      {loading ? (
        <SectionCard title="Chargement">
          <p className="text-sm text-slate-600 dark:text-slate-300">Chargement des départs…</p>
        </SectionCard>
      ) : rows.length === 0 ? (
        <SectionCard title="Départs">
          <EmptyState message="Aucun départ configuré pour cette date." />
        </SectionCard>
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.key}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
                    <Route className="h-4 w-4 text-orange-600" />
                    <span className="truncate">{row.departure} → {row.arrival}</span>
                  </p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {formatDateFrShort(row.date)} · {row.heure}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(row.status)}`}>
                  {row.statusLabel}
                </span>
              </div>

              {row.status === "late" && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">
                  <AlertTriangle className="h-4 w-4" />
                  Retard : {row.delayMinutes} min
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Passagers confirmés" value={row.soldSeats} />
                <Metric label="Embarqués" value={row.boardedSeats} />
                <Metric label="Absents" value={row.absentSeats} />
                <Metric label="Places vendues" value={`${row.soldSeats} / ${row.capacity}`} />
              </div>

              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span>Taux de remplissage</span>
                  <span>{Math.round(row.fillRate * 100)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${Math.round(row.fillRate * 100)}%` }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRow(row)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <Eye className="h-4 w-4" />
                Voir détail
              </button>
            </article>
          ))}
        </section>
      )}

      {selectedRow && (
        <DepartureDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  );
};

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function DepartureDetailModal({ row, onClose }: { row: DepartureRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-t-3xl bg-white shadow-2xl dark:bg-slate-950 sm:rounded-3xl">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Détail départ</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {row.departure} → {row.arrival} · {formatDateFrShort(row.date)} · {row.heure}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              Fermer
            </button>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Metric label="Statut" value={row.statusLabel} />
            <Metric label="Places vendues" value={`${row.soldSeats} / ${row.capacity}`} />
            <Metric label="Remplissage" value={`${Math.round(row.fillRate * 100)}%`} />
            <Metric label="Embarqués" value={row.boardedSeats} />
            <Metric label="Absents" value={row.absentSeats} />
            <Metric label="Non traités" value={row.pendingSeats} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                <Users className="h-4 w-4" />
                Montant estimé
              </p>
              <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{money(row.estimatedAmount)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Perte estimée si places restantes</p>
              <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{money(row.estimatedLoss)}</p>
            </div>
          </div>
          {row.status === "late" && (
            <div className="rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">
              Retard détecté : {row.delayMinutes} minute{row.delayMinutes > 1 ? "s" : ""}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgencyDepartureValidationsPage;
