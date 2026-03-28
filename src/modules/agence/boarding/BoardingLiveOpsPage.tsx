// Phase 4 — Supervision temps réel des embarquements (liveStatus sur tripAssignments).
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateLongFr } from "@/utils/dateFmt";
import { StandardLayoutWrapper, PageHeader, SectionCard, EmptyState } from "@/ui";
import { Radio } from "lucide-react";
import {
  subscribeTripAssignmentsForDate,
  type TripAssignmentDoc,
  type TripAssignmentLiveStatus,
} from "@/modules/agence/planning/tripAssignmentService";
import { vehicleRef } from "@/modules/compagnie/fleet/vehiclesService";

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function liveBadgeClasses(status: TripAssignmentLiveStatus["status"] | "unknown"): string {
  switch (status) {
    case "waiting":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100";
    case "boarding":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-100";
    case "completed":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-200";
  }
}

function liveLabel(status: TripAssignmentLiveStatus["status"] | "unknown"): string {
  switch (status) {
    case "waiting":
      return "En attente";
    case "boarding":
      return "Embarquement";
    case "completed":
      return "Terminé";
    default:
      return "—";
  }
}

const BoardingLiveOpsPage: React.FC = () => {
  const { user } = useAuth() as { user: { companyId?: string; agencyId?: string } };
  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;

  const [selectedDate, setSelectedDate] = useState(() => toLocalISO(new Date()));
  const [rows, setRows] = useState<Array<TripAssignmentDoc & { id: string }>>([]);
  const [tripLabels, setTripLabels] = useState<Map<string, { departure: string; arrival: string }>>(new Map());
  const [plates, setPlates] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !userAgencyId) {
      setTripLabels(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(collection(db, `companies/${companyId}/agences/${userAgencyId}/weeklyTrips`));
        if (cancelled) return;
        const m = new Map<string, { departure: string; arrival: string }>();
        snap.docs.forEach((d) => {
          const data = d.data() as { departure?: string; arrival?: string };
          m.set(d.id, {
            departure: String(data.departure ?? ""),
            arrival: String(data.arrival ?? ""),
          });
        });
        setTripLabels(m);
      } catch {
        if (!cancelled) setTripLabels(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, userAgencyId]);

  useEffect(() => {
    if (!companyId || !userAgencyId) {
      setRows([]);
      return;
    }
    setError(null);
    const unsub = subscribeTripAssignmentsForDate(
      companyId,
      userAgencyId,
      selectedDate,
      (list) => {
        setRows(
          list.filter((a) => a.status === "planned" || a.status === "validated").sort((a, b) => {
            const t = String(a.heure).localeCompare(String(b.heure));
            if (t !== 0) return t;
            return a.tripId.localeCompare(b.tripId);
          })
        );
      },
      (e) => setError(e.message)
    );
    return () => unsub();
  }, [companyId, userAgencyId, selectedDate]);

  const vehicleIds = useMemo(() => [...new Set(rows.map((r) => r.vehicleId).filter(Boolean))], [rows]);

  useEffect(() => {
    if (!companyId || vehicleIds.length === 0) {
      setPlates(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const next = new Map<string, string>();
      await Promise.all(
        vehicleIds.map(async (vid) => {
          try {
            const vs = await getDoc(vehicleRef(companyId, vid));
            if (vs.exists()) {
              const p = (vs.data() as { plateNumber?: string })?.plateNumber ?? vid;
              next.set(vid, String(p));
            } else next.set(vid, vid);
          } catch {
            next.set(vid, vid);
          }
        })
      );
      if (!cancelled) setPlates(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, vehicleIds.join("|")]);

  if (!userAgencyId) {
    return (
      <StandardLayoutWrapper>
        <EmptyState message="Aucune agence rattachée à votre compte — la vue temps réel nécessite une agence." />
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Activité en direct"
        subtitle={`${formatDateLongFr(new Date(selectedDate + "T12:00:00"))} — suivi live des embarquements (tripAssignments).`}
        icon={Radio}
      />

      <SectionCard title="Période" className="mb-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">Date</span>
          <button
            type="button"
            className="px-2 py-1 rounded border border-gray-200 dark:border-slate-600"
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() - 1);
              setSelectedDate(toLocalISO(d));
            }}
          >
            ◀
          </button>
          <input
            type="date"
            className="border rounded px-2 py-1 dark:bg-slate-900 dark:border-slate-600"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button
            type="button"
            className="px-2 py-1 rounded border border-gray-200 dark:border-slate-600"
            onClick={() => {
              const d = new Date(selectedDate);
              d.setDate(d.getDate() + 1);
              setSelectedDate(toLocalISO(d));
            }}
          >
            ▶
          </button>
          <button
            type="button"
            className="ml-auto text-sm text-sky-600 dark:text-sky-400 underline"
            onClick={() => setSelectedDate(toLocalISO(new Date()))}
          >
            Aujourd’hui
          </button>
        </div>
      </SectionCard>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-800 dark:text-red-100">
          {error}
        </div>
      )}

      {!companyId ? (
        <EmptyState message="Chargement…" />
      ) : rows.length === 0 ? (
        <EmptyState message="Aucune affectation planifiée ou validée pour cette date." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-600 text-left text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-semibold">Trajet</th>
                <th className="px-4 py-3 font-semibold">Heure</th>
                <th className="px-4 py-3 font-semibold">Véhicule</th>
                <th className="px-4 py-3 font-semibold">Progression</th>
                <th className="px-4 py-3 font-semibold">Statut live</th>
                <th className="px-4 py-3 font-semibold">Affectation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => {
                const labels = tripLabels.get(a.tripId);
                const trajet =
                  labels && (labels.departure || labels.arrival)
                    ? `${labels.departure} → ${labels.arrival}`
                    : a.tripId;
                const ls = a.liveStatus;
                const st = ls?.status ?? "unknown";
                const boarded = ls?.boardedCount ?? 0;
                const expected = ls?.expectedCount ?? 0;
                const pct = expected > 0 ? Math.min(100, Math.round((boarded / expected) * 100)) : 0;
                const plate = plates.get(a.vehicleId) ?? a.vehicleId;
                return (
                  <tr
                    key={a.id}
                    className="border-b border-gray-100 dark:border-slate-700/80 hover:bg-gray-50/80 dark:hover:bg-slate-700/40"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{trajet}</td>
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-100">{a.heure}</td>
                    <td className="px-4 py-3 text-gray-800 dark:text-gray-100 font-mono text-xs">{plate}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-[100px] h-2 rounded-full bg-gray-200 dark:bg-slate-600 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
                            style={{ width: `${expected > 0 ? pct : 0}%` }}
                          />
                        </div>
                        <span className="text-gray-700 dark:text-gray-200 whitespace-nowrap tabular-nums">
                          {boarded} / {expected}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${liveBadgeClasses(st)}`}
                      >
                        {liveLabel(st)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          a.status === "validated" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"
                        }`}
                      >
                        {a.status === "validated" ? "Validé logistique" : "Planifié"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </StandardLayoutWrapper>
  );
};

export default BoardingLiveOpsPage;
