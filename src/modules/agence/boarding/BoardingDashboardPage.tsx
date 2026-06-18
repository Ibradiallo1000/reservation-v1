// src/modules/agence/boarding/BoardingDashboardPage.tsx
// Départs planifiés (date sélectionnée) : tripAssignments (planifié / validé) = source unique pour l’embarquement.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDoc, getDocs, query, where } from "firebase/firestore";

import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, EmptyState } from "@/ui";
import { Plane } from "lucide-react";
import { listBoardingTripAssignmentsForDate } from "@/modules/agence/planning/tripAssignmentService";
import { vehicleRef } from "@/modules/compagnie/fleet/vehiclesService";
import DatePicker from "react-datepicker";
import { fr } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

type WeeklyTripLite = { id: string; departure: string; arrival: string };

type DepartureCardItem = {
  agencyId: string;
  agencyNom: string;
  departure: string;
  arrival: string;
  heure: string;
  date: string;
  vehicleId: string;
  assignmentStatus: "planned" | "validated";
  plate: string;
  tripId?: string;
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

    return Array.from(map.values()).sort((x, y) => (x.heure < y.heure ? -1 : x.heure > y.heure ? 1 : 0));
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
            const data = d.data() as { departure?: string; arrival?: string };
            tripById.set(d.id, {
              id: d.id,
              departure: String(data.departure ?? ""),
              arrival: String(data.arrival ?? ""),
            });
          });

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
                assignmentStatus,
                plate: plates.get(a.vehicleId) ?? a.vehicleId ?? "",
                tripId: a.tripId ?? "",
              });
            } else {
              planningGroups.set(key, {
                ...existing,
                assignmentStatus:
                  existing.assignmentStatus === "validated" || assignmentStatus === "validated" ? "validated" : "planned",
                vehicleId: existing.vehicleId || a.vehicleId || "",
                plate: existing.plate || plates.get(a.vehicleId) || a.vehicleId || "",
                tripId: existing.tripId || a.tripId || "",
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
            assignmentStatus: "planned",
            plate: "",
            tripId: undefined,
            expectedPassengers: r.expectedPassengers,
            boardedPassengers: r.boardedPassengers,
            absentPassengers: r.absentPassengers,
            remainingSeats: r.remainingSeats,
          });
        }

        const finalList = Array.from(finalMap.values()).sort((x, y) => (x.heure < y.heure ? -1 : x.heure > y.heure ? 1 : 0));
        setDepartures(finalList);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, userAgencyId, selectedDate]);

  const primaryColor = (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9";

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-4xl">
      <PageHeader title="Départs du jour" subtitle="Suivez les départs à embarquer aujourd’hui." icon={Plane} />

      <SectionCard title="Filtre date">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="px-2 py-1 rounded border border-gray-200 dark:border-slate-600 text-sm"
            onClick={() => {
              const d = new Date(`${selectedDate}T00:00:00`);
              d.setDate(d.getDate() - 1);
              setSelectedDate(toLocalISO(d));
            }}
          >
            ◀ Jour précédent
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
            className="border rounded px-3 py-1 text-sm bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-600 w-[120px]"
          />

          <button
            type="button"
            className="px-2 py-1 rounded border border-gray-200 dark:border-slate-600 text-sm"
            onClick={() => {
              const d = new Date(`${selectedDate}T00:00:00`);
              d.setDate(d.getDate() + 1);
              setSelectedDate(toLocalISO(d));
            }}
          >
            Jour suivant ▶
          </button>

          {selectedDate !== today && (
            <button
              type="button"
              className="px-2 py-1 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-700 dark:text-emerald-300 text-sm"
              onClick={() => setSelectedDate(today)}
            >
              Revenir à aujourd&apos;hui
            </button>
          )}
        </div>
      </SectionCard>

      {loading ? (
        <p className="text-gray-600 dark:text-gray-200">Chargement…</p>
      ) : dedupedDepartures.length === 0 ? (
        <SectionCard title="Départs">
          <EmptyState message="Aucun départ planifié pour cette date (tripAssignments). Planifiez un véhicule par créneau ; la logistique peut valider avant embarquement." />
        </SectionCard>
      ) : (
        <SectionCard title="Départs pour la date sélectionnée">
          <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
            {dedupedDepartures.map((d) => (
              <div
                key={`${d.date}|${d.heure}|${d.departure}|${d.arrival}`}
                className="rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {d.departure} → {d.arrival}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">Heure : {d.heure}</div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">Véhicule : {d.plate || "—"}</div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        d.assignmentStatus === "validated"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                      }`}
                    >
                      {d.assignmentStatus === "validated" ? "Validé" : "Planifié"}
                    </span>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">{d.agencyNom}</div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-700 px-2 py-1">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Passagers</div>
                    <div className="font-semibold">{d.expectedPassengers}</div>
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-700 px-2 py-1">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Embarqués</div>
                    <div className="font-semibold">{d.boardedPassengers}</div>
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-700 px-2 py-1">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Absents</div>
                    <div className="font-semibold">{d.absentPassengers}</div>
                  </div>

                  <div className="rounded-lg bg-gray-50 dark:bg-slate-900/30 border border-gray-100 dark:border-slate-700 px-2 py-1">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">Places restantes</div>
                    <div className="font-semibold">{d.remainingSeats == null ? "—" : d.remainingSeats}</div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/agence/boarding/scan", {
                        state: {
                          agencyId: d.agencyId,
                          date: d.date,
                          trajet: `${d.departure} → ${d.arrival}`,
                          heure: d.heure,
                          departure: d.departure,
                          arrival: d.arrival,
                          assignmentStatus: d.assignmentStatus,
                        },
                      })
                    }
                    className="px-4 py-2 rounded-lg text-sm font-semibold"
                    style={{ background: primaryColor, color: "white" }}
                  >
                    Ouvrir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </StandardLayoutWrapper>
  );
};

export default BoardingDashboardPage;
