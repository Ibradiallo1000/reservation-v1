// src/modules/agence/boarding/BoardingDashboardPage.tsx
// Phase 3: Today's departures — boarding officer only sees this and scan.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateLongFr } from "@/utils/dateFmt";

type AgencyItem = { id: string; nom: string };
type WeeklyTrip = {
  id: string;
  departure: string;
  arrival: string;
  horaires: Record<string, string[]>;
  active: boolean;
};

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

const BoardingDashboardPage: React.FC = () => {
  const { user, company } = useAuth() as { user: { companyId?: string; agencyId?: string }; company: unknown };
  const navigate = useNavigate();
  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;

  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [departures, setDepartures] = useState<Array<{
    agencyId: string;
    agencyNom: string;
    tripId: string;
    departure: string;
    arrival: string;
    heure: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const today = toLocalISO(new Date());
  const dayName = weekdayFR(new Date());

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
        const agencyList: AgencyItem[] = agencesSnap.docs.map((d) => ({
          id: d.id,
          nom: (d.data() as { nom?: string; name?: string })?.nom ?? (d.data() as { name?: string })?.name ?? d.id,
        }));
        setAgencies(agencyList);

        const agencyIds = userAgencyId ? [userAgencyId] : agencyList.map((a) => a.id);
        const list: typeof departures = [];

        for (const agencyId of agencyIds) {
          const tripsSnap = await getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`));
          const agencyNom = agencyList.find((a) => a.id === agencyId)?.nom ?? agencyId;
          const hours = (tripsSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as WeeklyTrip))
            .filter((t) => t.active && (t.horaires?.[dayName]?.length ?? 0) > 0));

          for (const t of hours) {
            const horaires = (t.horaires?.[dayName] ?? []).slice().sort();
            for (const heure of horaires) {
              list.push({
                agencyId,
                agencyNom,
                tripId: t.id,
                departure: t.departure,
                arrival: t.arrival,
                heure,
              });
            }
          }
        }
        setDepartures(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, userAgencyId, dayName]);

  const primaryColor = (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9";

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto min-h-screen text-sm sm:text-base text-gray-900 dark:text-white" style={{ fontSize: "14px" }}>
      <h1 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">Départs du jour</h1>
      <p className="text-sm text-gray-600 dark:text-gray-200 mb-4">
        {formatDateLongFr(new Date())} — Sélectionnez un départ pour ouvrir la liste d&apos;embarquement.
      </p>
      {loading ? (
        <div className="text-gray-600 dark:text-gray-200">Chargement…</div>
      ) : departures.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-600 shadow-md p-6 text-center text-gray-600 dark:text-gray-200">
          Aucun départ planifié pour aujourd&apos;hui.
        </div>
      ) : (
        <ul className="space-y-2">
          {departures.map((d) => (
            <li key={`${d.agencyId}_${d.tripId}_${d.heure}`}>
              <button
                type="button"
                onClick={() =>
                  navigate("/agence/boarding/scan", {
                    state: {
                      agencyId: d.agencyId,
                      date: today,
                      trajet: `${d.departure} → ${d.arrival}`,
                      heure: d.heure,
                      tripId: d.tripId,
                      departure: d.departure,
                      arrival: d.arrival,
                    },
                  })
                }
                className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 shadow-md flex items-center justify-between text-gray-900 dark:text-white"
                style={{ borderLeftWidth: 4, borderLeftColor: primaryColor }}
              >
                <span className="font-medium">
                  {d.departure} → {d.arrival} à {d.heure}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-200">{d.agencyNom}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default BoardingDashboardPage;
