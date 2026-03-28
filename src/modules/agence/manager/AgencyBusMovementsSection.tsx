/**
 * Synthèse opérationnelle flotte — jour agence (tripInstances).
 */
import React, { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/fr";
import { db } from "@/firebaseConfig";
import { SectionCard, MetricCard } from "@/ui";
import { Bus, Clock } from "lucide-react";
import {
  tripInstanceArrival,
  tripInstanceDeparture,
  tripInstanceTime,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("fr");

const LATE_GRACE_MINUTES = 15;

export type AgencyBusMovementsSectionProps = {
  companyId: string;
  agencyId: string;
  todayKey: string;
  agencyTz: string;
};

type RawTrip = {
  id: string;
  date: string;
  status: string;
  departureTime?: string;
  time?: string;
};

function normalizeInstanceStatus(raw: unknown): string {
  const s = String(raw ?? "scheduled").toLowerCase();
  if (s === "boarding" || s === "scheduled" || s === "departed" || s === "arrived" || s === "cancelled") {
    return s;
  }
  return "scheduled";
}

function departureInAgencyTz(dateStr: string, timeStr: string, tz: string): dayjs.Dayjs {
  const t = (timeStr || "00:00").trim().slice(0, 5);
  return dayjs.tz(`${dateStr} ${t}`, "YYYY-MM-DD HH:mm", tz);
}

function routeLabel(ti: unknown): string {
  const dep = tripInstanceDeparture(ti);
  const arr = tripInstanceArrival(ti);
  const tm = tripInstanceTime(ti);
  return `${dep || "—"} → ${arr || "—"} · ${tm || "—"}`;
}

/** Date du jour agence en français (pas de clé technique affichée). */
function labelForAgencyDay(todayKey: string, agencyTz: string): string {
  const anchor = dayjs.tz(`${todayKey} 12:00`, "YYYY-MM-DD HH:mm", agencyTz);
  if (!anchor.isValid()) return todayKey;
  const s = anchor.format("dddd D MMMM YYYY");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function AgencyBusMovementsSection({
  companyId,
  agencyId,
  todayKey,
  agencyTz,
}: AgencyBusMovementsSectionProps) {
  const [trips, setTrips] = useState<RawTrip[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setTrips([]);
      return;
    }
    const ref = collection(db, "companies", companyId, "tripInstances");
    const q = query(
      ref,
      where("agencyId", "==", agencyId),
      where("date", "==", todayKey),
      orderBy("departureTime", "asc"),
      limit(120)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) })) as RawTrip[];
        setTrips(rows);
      },
      (err) => {
        console.warn("[AgencyBusMovementsSection] snapshot failed:", err);
        setLoadError("Impossible de charger les trajets du jour.");
        setTrips([]);
      }
    );
    return () => unsub();
  }, [companyId, agencyId, todayKey]);

  const { prevus, enTransit, arrives, retards, prevusRows, enTransitRows, arrivesRows, retardsRows } =
    useMemo(() => {
      const nowAg = dayjs().tz(agencyTz);
      const prevusList: RawTrip[] = [];
      const transitList: RawTrip[] = [];
      const arrivedList: RawTrip[] = [];
      const lateList: RawTrip[] = [];

      for (const ti of trips) {
        const st = normalizeInstanceStatus(ti.status);
        if (st === "cancelled") continue;

        if (st === "departed") {
          transitList.push(ti);
          continue;
        }
        if (st === "arrived") {
          arrivedList.push(ti);
          continue;
        }
        if (st === "scheduled" || st === "boarding") {
          prevusList.push(ti);
          const depAt = departureInAgencyTz(String(ti.date ?? todayKey), tripInstanceTime(ti), agencyTz);
          if (nowAg.isAfter(depAt.add(LATE_GRACE_MINUTES, "minute"))) {
            lateList.push(ti);
          }
        }
      }

      const take = (arr: RawTrip[], n: number) => arr.slice(0, n);

      return {
        prevus: prevusList.length,
        enTransit: transitList.length,
        arrives: arrivedList.length,
        retards: lateList.length,
        prevusRows: take(prevusList, 6),
        enTransitRows: take(transitList, 6),
        arrivesRows: take(arrivedList, 6),
        retardsRows: take(lateList, 8),
      };
    }, [trips, agencyTz, todayKey]);

  if (!companyId || !agencyId) return null;

  const jourLabel = labelForAgencyDay(todayKey, agencyTz);

  return (
    <SectionCard
      title="Mouvements des bus"
      description={`Bus prévus, en route et arrivés pour ${jourLabel}, pour les lignes qui partent de cette agence (données du planning, mises à jour en direct).`}
      icon={Bus}
    >
      {loadError ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {loadError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Départs prévus"
          icon={Clock}
          value={prevus}
          hint="Bus encore à l’agence ou en cours d’embarquement."
        />
        <MetricCard
          label="Bus sur la route"
          icon={Bus}
          value={enTransit}
          hint="Le départ a été enregistré : le bus a quitté l’agence."
        />
        <MetricCard
          label="Bus arrivés"
          icon={Bus}
          value={arrives}
          hint="Le trajet prévu pour ce jour est arrivé à destination."
        />
        <MetricCard
          label="Retards"
          icon={Clock}
          value={retards}
          hint={`Heure de départ dépassée de plus de ${LATE_GRACE_MINUTES} minutes alors que le bus n’a pas encore enregistré son départ.`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 text-xs text-gray-600 dark:text-slate-400 md:grid-cols-2">
        <div>
          <p className="mb-1.5 font-semibold text-gray-800 dark:text-slate-200">Prochains départs</p>
          {prevusRows.length === 0 ? (
            <p className="text-gray-400">Aucun départ prévu à cette date.</p>
          ) : (
            <ul className="space-y-1 border-l-2 border-slate-200 pl-2 dark:border-slate-600">
              {prevusRows.map((ti) => (
                <li key={ti.id} className="truncate" title={routeLabel(ti)}>
                  {routeLabel(ti)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1.5 font-semibold text-gray-800 dark:text-slate-200">Sur la route / arrivés</p>
          {enTransitRows.length === 0 && arrivesRows.length === 0 ? (
            <p className="text-gray-400">Aucun bus sur la route ni arrivé pour l’instant.</p>
          ) : (
            <ul className="space-y-1 border-l-2 border-slate-200 pl-2 dark:border-slate-600">
              {enTransitRows.map((ti) => (
                <li key={ti.id} className="truncate text-amber-800 dark:text-amber-200" title={routeLabel(ti)}>
                  Sur la route — {routeLabel(ti)}
                </li>
              ))}
              {arrivesRows.map((ti) => (
                <li key={ti.id} className="truncate text-emerald-800 dark:text-emerald-200" title={routeLabel(ti)}>
                  Arrivé — {routeLabel(ti)}
                </li>
              ))}
            </ul>
          )}
        </div>
        {retardsRows.length > 0 ? (
          <div className="md:col-span-2">
            <p className="mb-1.5 font-semibold text-rose-800 dark:text-rose-200">Départs en retard</p>
            <ul className="space-y-1 border-l-2 border-rose-200 pl-2 dark:border-rose-900">
              {retardsRows.map((ti) => (
                <li key={ti.id} className="truncate" title={routeLabel(ti)}>
                  {routeLabel(ti)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}
