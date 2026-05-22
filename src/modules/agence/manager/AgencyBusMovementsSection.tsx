/**
 * Synthèse opérationnelle flotte par état (tripInstances).
 */
import React, { useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import "dayjs/locale/fr";
import { db } from "@/firebaseConfig";
import { SectionCard, MetricCard } from "@/ui";
import { Bus, Clock, Info } from "lucide-react";
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
  mode?: "realtime" | "analysis";
  rangeStartKey?: string;
  rangeEndKey?: string;
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

function dateWindowForAgencyDay(todayKey: string, agencyTz: string): string[] {
  const anchor = dayjs.tz(`${todayKey} 12:00`, "YYYY-MM-DD HH:mm", agencyTz);
  if (!anchor.isValid()) return [todayKey];
  return [
    anchor.subtract(1, "day").format("YYYY-MM-DD"),
    anchor.format("YYYY-MM-DD"),
    anchor.add(1, "day").format("YYYY-MM-DD"),
  ];
}

function normalizeRange(startKey: string, endKey: string): { startKey: string; endKey: string } {
  return startKey <= endKey ? { startKey, endKey } : { startKey: endKey, endKey: startKey };
}

function metricHelp(title: string): React.ReactNode {
  return (
    <span className="ml-1 inline-flex align-middle" title={title}>
      <Info className="h-3.5 w-3.5 text-slate-400" aria-hidden />
    </span>
  );
}

export default function AgencyBusMovementsSection({
  companyId,
  agencyId,
  todayKey,
  agencyTz,
  mode = "realtime",
  rangeStartKey,
  rangeEndKey,
}: AgencyBusMovementsSectionProps) {
  const [trips, setTrips] = useState<RawTrip[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const queryRange = useMemo(() => {
    if (mode === "analysis" && rangeStartKey && rangeEndKey) {
      return normalizeRange(rangeStartKey, rangeEndKey);
    }
    const keys = dateWindowForAgencyDay(todayKey, agencyTz);
    return { startKey: keys[0] ?? todayKey, endKey: keys[keys.length - 1] ?? todayKey };
  }, [mode, rangeStartKey, rangeEndKey, todayKey, agencyTz]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setTrips([]);
      return;
    }
    const ref = collection(db, "companies", companyId, "tripInstances");
    const q = query(
      ref,
      where("agencyId", "==", agencyId),
      where("date", ">=", queryRange.startKey),
      where("date", "<=", queryRange.endKey),
      orderBy("date", "asc"),
      orderBy("departureTime", "asc"),
      limit(mode === "realtime" ? 300 : 700)
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
        setLoadError("Impossible de charger les mouvements des bus.");
        setTrips([]);
      }
    );

    return () => unsub();
  }, [companyId, agencyId, queryRange, mode]);

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
          const depAt = departureInAgencyTz(String(ti.date ?? todayKey), tripInstanceTime(ti), agencyTz);
          if (mode === "realtime" && nowAg.diff(depAt, "hour", true) > 18) continue;
          arrivedList.push(ti);
          continue;
        }
        if (st === "scheduled" || st === "boarding") {
          const depAt = departureInAgencyTz(String(ti.date ?? todayKey), tripInstanceTime(ti), agencyTz);
          const hoursLate = nowAg.diff(depAt, "hour", true);
          const hoursAhead = depAt.diff(nowAg, "hour", true);
          if (mode === "realtime" && (hoursLate > 18 || hoursAhead > 24)) continue;
          prevusList.push(ti);
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
    }, [trips, agencyTz, todayKey, mode]);

  if (!companyId || !agencyId) return null;

  return (
    <SectionCard
      title="Mouvements des bus"
      icon={Bus}
    >
      {loadError ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          {loadError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="En attente"
          icon={Clock}
          help={metricHelp("Bus à l'agence ou en embarquement.")}
          value={prevus}
        />
        <MetricCard
          label="En route"
          icon={Bus}
          help={metricHelp("Départ enregistré.")}
          value={enTransit}
        />
        <MetricCard
          label="Arrivés"
          icon={Bus}
          help={metricHelp("Arrivée enregistrée.")}
          value={arrives}
        />
        <MetricCard
          label="Retard"
          icon={Clock}
          help={metricHelp(`Départ dépassé de plus de ${LATE_GRACE_MINUTES} minutes.`)}
          value={retards}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 text-xs text-gray-600 dark:text-slate-400 md:grid-cols-2">
        <div>
          <p className="mb-1.5 font-semibold text-gray-800 dark:text-slate-200">En attente</p>
          {prevusRows.length === 0 ? (
            <p className="text-gray-400">Aucun bus en attente.</p>
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
          <p className="mb-1.5 font-semibold text-gray-800 dark:text-slate-200">En route / arrivés</p>
          {enTransitRows.length === 0 && arrivesRows.length === 0 ? (
            <p className="text-gray-400">Aucun bus en mouvement.</p>
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
            <p className="mb-1.5 font-semibold text-rose-800 dark:text-rose-200">Retards</p>
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
