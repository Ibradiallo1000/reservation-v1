// src/modules/agence/boarding/BoardingDashboardPage.tsx
// Départs planifiés (date sélectionnée) : tripAssignments (planifié / validé) = source unique pour l’embarquement.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateLongFr } from "@/utils/dateFmt";
import { StandardLayoutWrapper, PageHeader, SectionCard, EmptyState } from "@/ui";
import { Plane } from "lucide-react";
import { listBoardingTripAssignmentsForDate } from "@/modules/agence/planning/tripAssignmentService";
import { vehicleRef } from "@/modules/compagnie/fleet/vehiclesService";
import DatePicker from "react-datepicker";
import { fr } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";

type WeeklyTripLite = { id: string; departure: string; arrival: string };

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const BoardingDashboardPage: React.FC = () => {
  const { user, company } = useAuth() as { user: { companyId?: string; agencyId?: string }; company: unknown };
  const navigate = useNavigate();
  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;

  const [departures, setDepartures] = useState<
    Array<{
      agencyId: string;
      agencyNom: string;
      assignmentId: string;
      tripId: string;
      departure: string;
      arrival: string;
      heure: string;
      date: string;
      vehicleId: string;
      assignmentStatus: "planned" | "validated";
      plate: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const today = toLocalISO(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const selectedDateObj = new Date(`${selectedDate}T00:00:00`);

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
          nom: (d.data() as { nom?: string; name?: string })?.nom ?? (d.data() as { name?: string })?.name ?? d.id,
        }));

        const agencyIds = userAgencyId ? [userAgencyId] : agencyList.map((a) => a.id);
        const list: typeof departures = [];

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
                } else plates.set(vid, vid);
              } catch {
                plates.set(vid, vid);
              }
            })
          );
          for (const a of assignments) {
            const st = a.status === "validated" ? "validated" : "planned";
            const t = tripById.get(a.tripId);
            list.push({
              agencyId,
              agencyNom,
              assignmentId: a.id,
              tripId: a.tripId,
              departure: t?.departure ?? a.tripId,
              arrival: t?.arrival ?? "",
              heure: a.heure,
              date: a.date,
              vehicleId: a.vehicleId,
              assignmentStatus: st,
              plate: plates.get(a.vehicleId) ?? a.vehicleId,
            });
          }
        }
        list.sort((x, y) => (x.heure < y.heure ? -1 : x.heure > y.heure ? 1 : 0));
        setDepartures(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, userAgencyId, selectedDate]);

  const primaryColor = (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9";

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-4xl">
      <PageHeader
        title="Départs planifiés"
        subtitle={`${formatDateLongFr(new Date(`${selectedDate}T00:00:00`))} — Source : planification (tripAssignments). Planifié ou validé logistique.`}
        icon={Plane}
      />
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
          <input
            type="hidden"
            value={selectedDate}
            readOnly
          />
          <DatePicker
            selected={selectedDateObj}
            onChange={(d) => {
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
      ) : departures.length === 0 ? (
        <SectionCard title="Départs">
          <EmptyState message="Aucun départ planifié pour cette date (tripAssignments). Planifiez un véhicule par créneau ; la logistique peut valider avant embarquement." />
        </SectionCard>
      ) : (
        <SectionCard title="Départs pour la date sélectionnée">
          <ul className="space-y-2">
            {departures.map((d) => (
              <li key={d.assignmentId}>
                <button
                  type="button"
                  onClick={() =>
                    navigate("/agence/boarding/scan", {
                      state: {
                        agencyId: d.agencyId,
                        date: d.date,
                        trajet: `${d.departure} → ${d.arrival}`,
                        heure: d.heure,
                        tripId: d.tripId,
                        departure: d.departure,
                        arrival: d.arrival,
                        assignmentId: d.assignmentId,
                        vehicleId: d.vehicleId,
                        assignmentStatus: d.assignmentStatus,
                      },
                    })
                  }
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 shadow-md flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-gray-900 dark:text-white"
                  style={{ borderLeftWidth: 4, borderLeftColor: primaryColor }}
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-medium">
                      {d.departure} → {d.arrival} à {d.heure}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">
                      Véhicule : <span className="font-mono font-medium">{d.plate}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        d.assignmentStatus === "validated"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                      }`}
                    >
                      {d.assignmentStatus === "validated" ? "Validé" : "Planifié"}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-200">{d.agencyNom}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </StandardLayoutWrapper>
  );
};

export default BoardingDashboardPage;
