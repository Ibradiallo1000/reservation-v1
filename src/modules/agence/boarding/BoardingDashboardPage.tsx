// src/modules/agence/boarding/BoardingDashboardPage.tsx
// Départs planifiés (date sélectionnée) : weeklyTrips = source planning, enrichie par tripAssignments/réservations.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, SectionCard, EmptyState } from "@/ui";
import { BarChart3, BusFront, Camera, List } from "lucide-react";
import { listBoardingTripAssignmentsForDate } from "@/modules/agence/planning/tripAssignmentService";
import { vehicleRef } from "@/modules/compagnie/fleet/vehiclesService";
import { buildTripInstanceId } from "@/modules/compagnie/tripInstances/tripInstanceService";
import DatePicker from "react-datepicker";
import { fr } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

type WeeklyTripLite = {
  id: string;
  departure: string;
  arrival: string;
  active: boolean;
  horaires: Record<string, string[]>;
};

type DepartureCardItem = {
  agencyId: string;
  agencyNom: string;
  departure: string;
  arrival: string;
  heure: string;
  date: string;
  vehicleId: string;
  assignmentId?: string;
  assignmentStatus: "planned" | "validated";
  plate: string;
  tripId?: string;
  tripInstanceId?: string;
  tripStatus?: string;
  expectedPassengers: number;
  boardedPassengers: number;
  absentPassengers: number;
  remainingSeats: number | null;
};

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const normalizeKeyPart = (v: unknown) => {
  const s = String(v ?? "");
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
};

const toBusinessKey = (date: string, heure: string, departure: string, arrival: string) =>
  `${normalizeKeyPart(date)}|${normalizeKeyPart(heure)}|${normalizeKeyPart(departure)}|${normalizeKeyPart(arrival)}`;

function weekdayFRFromISO(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
}

function formatDateFrShort(date: string): string {
  const [y, m, d] = date.split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

function displayDepartureStatus(d: DepartureCardItem & { tripStatus?: string }): {
  label: string;
  className: string;
} {
  const status = String(d.tripStatus ?? "").trim().toUpperCase();
  if (status === "OPEN") {
    return { label: "Ouvert", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" };
  }
  if (status === "CLOSED") {
    return { label: "Clôturé", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" };
  }
  if (status === "DEPARTED") {
    return { label: "Départ confirmé", className: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100" };
  }
  return { label: "Planifié", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100" };
}

const BoardingDashboardPage: React.FC = () => {
  const { user, company } = useAuth() as { user: { companyId?: string; agencyId?: string }; company: unknown };
  const navigate = useNavigate();
  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;

  const [departures, setDepartures] = useState<DepartureCardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const today = toLocalISO(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);

  const dedupedDepartures = useMemo((): DepartureCardItem[] => {
    const map = new Map<string, DepartureCardItem>();

    for (const d of departures) {
      const key = toBusinessKey(d.date, d.heure, d.departure, d.arrival);
      const existing = map.get(key);

      if (!existing) {
        map.set(key, d);
        continue;
      }

      const assignmentStatus: "planned" | "validated" =
        existing.assignmentStatus === "validated" || d.assignmentStatus === "validated" ? "validated" : "planned";

      map.set(key, {
        ...existing,
        ...d,
        assignmentStatus,
        expectedPassengers: Math.max(existing.expectedPassengers ?? 0, d.expectedPassengers ?? 0),
        boardedPassengers: Math.max(existing.boardedPassengers ?? 0, d.boardedPassengers ?? 0),
        absentPassengers: Math.max(existing.absentPassengers ?? 0, d.absentPassengers ?? 0),
        remainingSeats:
          existing.remainingSeats == null
            ? d.remainingSeats
            : d.remainingSeats == null
            ? existing.remainingSeats
            : Math.max(existing.remainingSeats, d.remainingSeats),
        agencyNom: existing.agencyNom || d.agencyNom,
        plate: existing.plate || d.plate,
        vehicleId: existing.vehicleId || d.vehicleId,
        tripId: existing.tripId || d.tripId,
      });
    }

    return Array.from(map.values()).sort((x, y) => {
      const byTime = x.heure.localeCompare(y.heure);
      if (byTime !== 0) return byTime;
      return `${x.departure} ${x.arrival}`.localeCompare(`${y.departure} ${y.arrival}`);
    });
  }, [departures]);

  useEffect(() => {
    if (!companyId) {
      setDepartures([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const agencesSnap = await getDocs(collection(db, `companies/${companyId}/agences`));
        const agencyList = agencesSnap.docs.map((d) => ({
          id: d.id,
          nom:
            (d.data() as { nom?: string; name?: string })?.nom ??
            (d.data() as { name?: string })?.name ??
            d.id,
        }));

        const agencyIds = userAgencyId ? [userAgencyId] : agencyList.map((a) => a.id);
        const dayName = weekdayFRFromISO(selectedDate);

        type ReservationGroup = {
          key: string;
          agencyId: string;
          agencyNom: string;
          date: string;
          heure: string;
          departure: string;
          arrival: string;
          expectedPassengers: number;
          boardedPassengers: number;
          absentPassengers: number;
          remainingSeats: number | null;
        };

        const reservationGroups = new Map<string, ReservationGroup>();
        const planningGroups = new Map<string, Omit<DepartureCardItem, "expectedPassengers" | "boardedPassengers" | "absentPassengers" | "remainingSeats">>();

        for (const agencyId of agencyIds) {
          const agencyNom = agencyList.find((a) => a.id === agencyId)?.nom ?? agencyId;

          const tripsSnap = await getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`));
          const tripById = new Map<string, WeeklyTripLite>();
          tripsSnap.docs.forEach((d) => {
            const data = d.data() as { departure?: string; arrival?: string; active?: boolean; horaires?: Record<string, unknown> };
            tripById.set(d.id, {
              id: d.id,
              departure: String(data.departure ?? ""),
              arrival: String(data.arrival ?? ""),
              active: data.active === true,
              horaires: Object.fromEntries(
                Object.entries(data.horaires ?? {}).map(([day, values]) => [
                  day,
                  Array.isArray(values) ? values.map(String).filter(Boolean) : [],
                ])
              ),
            });
          });

          for (const t of tripById.values()) {
            if (!t.active) continue;
            const departure = t.departure.trim();
            const arrival = t.arrival.trim();
            if (!departure || !arrival) continue;

            const hours = [...(t.horaires[dayName] ?? [])].map(String).filter(Boolean).sort();
            for (const heureRaw of hours) {
              const heure = String(heureRaw).trim();
              if (!heure) continue;

              const key = toBusinessKey(selectedDate, heure, departure, arrival);
              const tripInstanceId = buildTripInstanceId(t.id, selectedDate, heure);
              let tripStatus: string | undefined;

              try {
                const departureSnap = await getDoc(
                  doc(db, `companies/${companyId}/agences/${agencyId}/departures/${tripInstanceId}`)
                );
                if (departureSnap.exists()) {
                  tripStatus = String((departureSnap.data() as { tripStatus?: string }).tripStatus ?? "") || undefined;
                }
              } catch {
                tripStatus = undefined;
              }

              planningGroups.set(key, {
                agencyId,
                agencyNom,
                departure,
                arrival,
                heure,
                date: selectedDate,
                vehicleId: "",
                assignmentId: undefined,
                assignmentStatus: "planned",
                plate: "",
                tripId: t.id,
                tripInstanceId,
                tripStatus,
              });
            }
          }

          const assignments = await listBoardingTripAssignmentsForDate(companyId, agencyId, selectedDate);
          const plates = new Map<string, string>();

          await Promise.all(
            [...new Set(assignments.map((x) => x.vehicleId).filter(Boolean))].map(async (vid) => {
              try {
                const vs = await getDoc(vehicleRef(companyId, vid));
                if (vs.exists()) {
                  const p = (vs.data() as { plateNumber?: string })?.plateNumber ?? vid;
                  plates.set(vid, String(p));
                } else {
                  plates.set(vid, vid);
                }
              } catch {
                plates.set(vid, vid);
              }
            })
          );

          for (const a of assignments) {
            const t = tripById.get(a.tripId);
            const departure = String(t?.departure ?? a.tripId ?? "").trim();
            const arrival = String(t?.arrival ?? "").trim();
            const heure = String(a.heure ?? "").trim();
            const date = String(a.date ?? selectedDate).trim();

            if (!heure || !departure || !arrival) continue;

            const key = toBusinessKey(date, heure, departure, arrival);
            const assignmentStatus: "planned" | "validated" = a.status === "validated" ? "validated" : "planned";

            const existing = planningGroups.get(key);
            if (!existing) {
              planningGroups.set(key, {
                agencyId,
                agencyNom,
                departure,
                arrival,
                heure,
                date,
                vehicleId: a.vehicleId ?? "",
                assignmentId: (a as { id?: string }).id,
                assignmentStatus,
                plate: plates.get(a.vehicleId) ?? a.vehicleId ?? "",
                tripId: a.tripId ?? "",
                tripInstanceId: a.tripId ? buildTripInstanceId(a.tripId, date, heure) : undefined,
              });
            } else {
              planningGroups.set(key, {
                ...existing,
                assignmentStatus:
                  existing.assignmentStatus === "validated" || assignmentStatus === "validated" ? "validated" : "planned",
                vehicleId: existing.vehicleId || a.vehicleId || "",
                assignmentId: existing.assignmentId || (a as { id?: string }).id,
                plate: existing.plate || plates.get(a.vehicleId) || a.vehicleId || "",
                tripId: existing.tripId || a.tripId || "",
                tripInstanceId: existing.tripInstanceId || (a.tripId ? buildTripInstanceId(a.tripId, date, heure) : undefined),
              });
            }
          }

          const reservationsRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
          const reservationsSnap = await getDocs(query(reservationsRef, where("date", "==", selectedDate)));

          const excludedStatuts = new Set([
            "annulé",
            "annule",
            "refusé",
            "refuse",
            "cancelled",
            "canceled",
            "en_attente_paiement",
          ]);

          reservationsSnap.docs.forEach((docSnap) => {
            const d = docSnap.data() as Record<string, any>;

            const statutRaw = String(d.statut ?? "").trim().toLowerCase();
            if (excludedStatuts.has(statutRaw)) return;

            const heure = String(d.heure ?? d.time ?? "").trim();
            if (!heure) return;

            const departure = String(d.departure ?? d.depart ?? "").trim();
            const arrival = String(d.arrival ?? d.arrivee ?? "").trim();
            if (!departure || !arrival) return;

            const seats = Number(d.seatsGo ?? d.places ?? d.seats ?? 1) || 1;

            const boardingStatus = String(d.boardingStatus ?? "").trim().toLowerCase();
            const statutEmbarquement = String(d.statutEmbarquement ?? "").trim().toLowerCase();

            const isBoarded = boardingStatus === "boarded" || statutEmbarquement === "embarqué" || statutEmbarquement === "embarque";
            const isNoShow = boardingStatus === "no_show" || statutEmbarquement === "absent";

            const key = toBusinessKey(selectedDate, heure, departure, arrival);
            const g = reservationGroups.get(key) ?? {
              key,
              agencyId,
              agencyNom,
              date: selectedDate,
              heure,
              departure,
              arrival,
              expectedPassengers: 0,
              boardedPassengers: 0,
              absentPassengers: 0,
              remainingSeats: null,
            };

            g.expectedPassengers += seats;
            if (isBoarded) g.boardedPassengers += seats;
            if (isNoShow) g.absentPassengers += seats;

            reservationGroups.set(key, g);
          });
        }

        const finalMap = new Map<string, DepartureCardItem>();

        for (const [key, p] of planningGroups.entries()) {
          const r = reservationGroups.get(key);

          finalMap.set(key, {
            ...p,
            expectedPassengers: r?.expectedPassengers ?? 0,
            boardedPassengers: r?.boardedPassengers ?? 0,
            absentPassengers: r?.absentPassengers ?? 0,
            remainingSeats: r?.remainingSeats ?? null,
          });
        }

        for (const [key, r] of reservationGroups.entries()) {
          if (finalMap.has(key)) continue;

          finalMap.set(key, {
            agencyId: r.agencyId,
            agencyNom: r.agencyNom,
            departure: r.departure,
            arrival: r.arrival,
            heure: r.heure,
            date: r.date,
            vehicleId: "",
            assignmentId: undefined,
            assignmentStatus: "planned",
            plate: "",
            tripId: undefined,
            tripInstanceId: undefined,
            expectedPassengers: r.expectedPassengers,
            boardedPassengers: r.boardedPassengers,
            absentPassengers: r.absentPassengers,
            remainingSeats: r.remainingSeats,
          });
        }

        const finalList = Array.from(finalMap.values()).sort((x, y) => {
          const byTime = x.heure.localeCompare(y.heure);
          if (byTime !== 0) return byTime;
          return `${x.departure} ${x.arrival}`.localeCompare(`${y.departure} ${y.arrival}`);
        });
        setDepartures(finalList);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, userAgencyId, selectedDate]);

  const primaryColor = (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9";

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-none">
      <div className="w-full pb-24 sm:pb-0">
        <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Suivez les départs à embarquer aujourd’hui.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-lg font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-100 dark:hover:bg-slate-900"
              aria-label="Jour précédent"
              onClick={() => {
                const d = new Date(`${selectedDate}T00:00:00`);
                d.setDate(d.getDate() - 1);
                setSelectedDate(toLocalISO(d));
              }}
            >
              ‹
            </button>

            <input type="hidden" value={selectedDate} readOnly />

            <DatePicker
              selected={selectedDateObj}
              onChange={(d: Date | null) => {
                if (!d) return;
                setSelectedDate(toLocalISO(d));
              }}
              dateFormat="dd/MM/yyyy"
              locale={fr}
              shouldCloseOnSelect
              className="h-9 w-[132px] rounded-lg border border-gray-200 bg-gray-50 px-3 text-center text-sm font-extrabold text-gray-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
            />

            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-lg border border-gray-200 text-lg font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:text-gray-100 dark:hover:bg-slate-900"
              aria-label="Jour suivant"
              onClick={() => {
                const d = new Date(`${selectedDate}T00:00:00`);
                d.setDate(d.getDate() + 1);
                setSelectedDate(toLocalISO(d));
              }}
            >
              ›
            </button>

            {selectedDate !== today && (
              <button
                type="button"
                className="hidden h-9 items-center rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950/30 sm:inline-flex"
                onClick={() => setSelectedDate(today)}
              >
                Aujourd&apos;hui
              </button>
            )}
          </div>
        </div>

      {loading ? (
        <p className="text-gray-600 dark:text-gray-200">Chargement…</p>
      ) : dedupedDepartures.length === 0 ? (
        <SectionCard title="Départs">
          <EmptyState message="Aucun départ configuré pour cette date." />
        </SectionCard>
      ) : (
        <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="grid w-full grid-cols-1 justify-start gap-3 sm:grid-cols-[repeat(auto-fit,minmax(220px,280px))]">
            {dedupedDepartures.map((d) => {
              const status = displayDepartureStatus(d);
              return (
              <div
                key={`${d.date}|${d.heure}|${d.departure}|${d.arrival}`}
                className="flex min-h-[142px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md dark:border-slate-600 dark:bg-slate-800"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-extrabold text-gray-900 dark:text-white sm:text-sm">
                      {d.departure} → {d.arrival}
                    </div>
                    <div className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {formatDateFrShort(d.date)} • {d.heure}
                    </div>
                    {d.plate && (
                      <div className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300">
                        Véhicule : {d.plate}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>

                <div className="mt-3 truncate text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {d.expectedPassengers} passagers · {d.boardedPassengers} embarqués · {d.absentPassengers} absent{d.absentPassengers > 1 ? "s" : ""}
                </div>

                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/agence/boarding/scan?view=scan", {
                        state: {
                          agencyId: d.agencyId,
                          date: d.date,
                          heure: d.heure,
                          departure: d.departure,
                          arrival: d.arrival,
                          trajet: `${d.departure} → ${d.arrival}`,
                          trajetId: d.tripId,
                          tripId: d.tripId,
                          weeklyTripId: d.tripId,
                          tripInstanceId: d.tripInstanceId,
                          assignmentId: d.assignmentId ?? null,
                          vehicleId: d.vehicleId || undefined,
                          assignmentStatus: d.assignmentStatus,
                        },
                      })
                    }
                    className="w-full rounded-lg px-4 py-2 text-sm font-bold"
                    style={{ background: primaryColor, color: "white" }}
                  >
                    Ouvrir
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        </section>
      )}
      </div>

      <nav className="no-print sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-950/95 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
        <div className="grid grid-cols-4 items-center gap-1.5 max-w-md mx-auto">
          <button
            type="button"
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl bg-red-50 text-[11px] font-bold text-red-700 dark:bg-red-950/30 dark:text-red-200"
            aria-current="page"
          >
            <BusFront className="h-5 w-5" aria-hidden />
            <span>Départs</span>
          </button>
          <button
            type="button"
            disabled
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-gray-400 dark:text-gray-500"
            aria-disabled="true"
            title="Ouvrez un départ pour accéder au scan"
          >
            <Camera className="h-5 w-5" aria-hidden />
            <span>Scan</span>
          </button>
          <button
            type="button"
            disabled
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-gray-400 dark:text-gray-500"
            aria-disabled="true"
            title="Ouvrez un départ pour accéder à la liste"
          >
            <List className="h-5 w-5" aria-hidden />
            <span>Liste</span>
          </button>
          <button
            type="button"
            disabled
            className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold text-gray-400 dark:text-gray-500"
            aria-disabled="true"
            title="Ouvrez un départ pour accéder aux rapports"
          >
            <BarChart3 className="h-5 w-5" aria-hidden />
            <span>Rapports</span>
          </button>
        </div>
      </nav>
    </StandardLayoutWrapper>
  );
};

export default BoardingDashboardPage;
