// src/modules/agence/pages/ManagerDashboardPage.tsx
// Phase 4 + 4.5: Manager Command Center — uses dailyStats + agencyLiveState to reduce listeners.
import React, { useEffect, useState, useMemo } from "react";
import { collection, doc, query, where, onSnapshot, getDocs, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateLongFr } from "@/utils/dateFmt";
import type { DailyStatsDoc } from "../aggregates/types";
import type { AgencyLiveStateDoc } from "../aggregates/types";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, EmptyState, table, tableRowClassName } from "@/ui";
import { LayoutDashboard } from "lucide-react";

const SESSION_DURATION_WARNING_HOURS = 8;

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

type ShiftDoc = {
  id: string;
  status: string;
  userId: string;
  userName?: string | null;
  startTime?: { toMillis?: () => number } | null;
  endTime?: { toMillis?: () => number } | null;
  createdAt?: { toMillis?: () => number } | null;
};

type ReservationDoc = {
  id: string;
  montant?: number;
  seatsGo?: number;
  shiftId?: string;
  date?: string;
  depart?: string;
  arrivee?: string;
  heure?: string;
  statut?: string;
  statutEmbarquement?: string;
};

type FleetVehicleDoc = {
  id: string;
  status: string;
  currentAgencyId?: string | null;
  destinationAgencyId?: string | null;
  plateNumber?: string;
};

type BoardingClosureDoc = { id: string };

const ManagerDashboardPage: React.FC = () => {
  const { user } = useAuth() as { user: { companyId?: string; agencyId?: string } };
  const companyId = user?.companyId ?? null;
  const agencyId = user?.agencyId ?? null;

  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [reservationsToday, setReservationsToday] = useState<ReservationDoc[]>([]);
  const [dailyStats, setDailyStats] = useState<DailyStatsDoc | null>(null);
  const [agencyLiveState, setAgencyLiveState] = useState<AgencyLiveStateDoc | null>(null);
  const [fleetVehicles, setFleetVehicles] = useState<FleetVehicleDoc[]>([]);
  const [boardingClosures, setBoardingClosures] = useState<BoardingClosureDoc[]>([]);
  const [weeklyTrips, setWeeklyTrips] = useState<Array<{ id: string; departure: string; arrival: string; horaires?: Record<string, string[]> }>>([]);
  const [loading, setLoading] = useState(true);

  const today = useMemo(() => toLocalISO(new Date()), []);
  const dayName = useMemo(() => weekdayFR(new Date()), []);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }

    // Phase 4.5: single doc listeners for aggregates (replaces heavy reservation aggregation)
    const dailyStatsRef = doc(db, `companies/${companyId}/agences/${agencyId}/dailyStats/${today}`);
    const unsubDailyStats = onSnapshot(dailyStatsRef, (snap) => {
      setDailyStats(snap.exists() ? (snap.data() as DailyStatsDoc) : null);
    });

    const agencyLiveStateRef = doc(db, `companies/${companyId}/agences/${agencyId}/agencyLiveState/current`);
    const unsubLiveState = onSnapshot(agencyLiveStateRef, (snap) => {
      setAgencyLiveState(snap.exists() ? (snap.data() as AgencyLiveStateDoc) : null);
    });

    // Shifts: filtered by status to limit payload (table detail)
    const qShifts = query(
      collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
      where("status", "in", ["active", "paused", "closed", "validated"]),
      limit(100)
    );
    const unsubShifts = onSnapshot(qShifts, (snap) =>
      setShifts(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ShiftDoc, "id">) })))
    );

    const qRes = query(
      collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
      where("date", "==", today),
      where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"])
    );
    const unsubRes = onSnapshot(qRes, (snap) =>
      setReservationsToday(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReservationDoc, "id">) })))
    );

    // Fleet: status-filtered to reduce reads (PART 4)
    const qFleet = query(
      collection(db, `companies/${companyId}/fleetVehicles`),
      where("status", "in", ["garage", "assigned", "in_transit"]),
      limit(200)
    );
    const unsubFleet = onSnapshot(qFleet, (snap) =>
      setFleetVehicles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FleetVehicleDoc, "id">) })))
    );

    const unsubClosures = onSnapshot(
      collection(db, `companies/${companyId}/agences/${agencyId}/boardingClosures`),
      (snap) => setBoardingClosures(snap.docs.map((d) => ({ id: d.id })))
    );

    getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`)).then((snap) => {
      setWeeklyTrips(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as { departure: string; arrival: string; horaires?: Record<string, string[]> }) }))
          .filter((t) => (t.horaires?.[dayName]?.length ?? 0) > 0)
      );
    });

    setLoading(false);
    return () => {
      unsubDailyStats();
      unsubLiveState();
      unsubShifts();
      unsubRes();
      unsubFleet();
      unsubClosures();
    };
  }, [companyId, agencyId, today, dayName]);

  // Prefer agencyLiveState when available (Phase 4.5); validated count stays from shifts (table consistency)
  const activeShiftsCount = agencyLiveState?.activeSessionsCount ?? shifts.filter((s) => s.status === "active" || s.status === "paused").length;
  const closedPendingCount = agencyLiveState?.closedPendingValidationCount ?? shifts.filter((s) => s.status === "closed").length;
  const validatedShifts = useMemo(() => shifts.filter((s) => s.status === "validated"), [shifts]);
  const validatedShiftsCount = validatedShifts.length;
  const activeShifts = useMemo(() => shifts.filter((s) => s.status === "active" || s.status === "paused"), [shifts]);
  const closedShifts = useMemo(() => shifts.filter((s) => s.status === "closed"), [shifts]);

  const revenueByShift = useMemo(() => {
    const map: Record<string, number> = {};
    reservationsToday.forEach((r) => {
      if (r.shiftId && r.montant != null) {
        map[r.shiftId] = (map[r.shiftId] ?? 0) + r.montant;
      }
    });
    return map;
  }, [reservationsToday]);

  // Phase 4.5: prefer dailyStats for KPIs
  const totalRevenueToday = useMemo(() => {
    if (dailyStats != null && dailyStats.totalRevenue != null) return Number(dailyStats.totalRevenue);
    return reservationsToday.reduce((acc, r) => acc + (r.montant ?? 0), 0);
  }, [dailyStats, reservationsToday]);
  const totalPassengersToday = useMemo(() => {
    if (dailyStats != null && dailyStats.totalPassengers != null) return Number(dailyStats.totalPassengers);
    return reservationsToday.reduce((acc, r) => acc + (r.seatsGo ?? 1), 0);
  }, [dailyStats, reservationsToday]);

  const departuresToday = useMemo(() => {
    const list: Array<{ tripId: string; departure: string; arrival: string; heure: string; capacity: number; embarked: number; closed: boolean }> = [];
    weeklyTrips.forEach((t) => {
      (t.horaires?.[dayName] ?? []).forEach((heure) => {
        const key = `${t.departure}_${t.arrival}_${heure}_${today}`.replace(/\s+/g, "-");
        const closed = boardingClosures.some((c) => c.id === key);
        const resForSlot = reservationsToday.filter(
          (r) => r.depart === t.departure && (r.arrivee ?? "") === t.arrival && r.heure === heure
        );
        const embarked = resForSlot.reduce((acc, r) => acc + (r.statutEmbarquement === "embarqué" ? (r.seatsGo ?? 1) : 0), 0);
        const capacity = 50;
        list.push({
          tripId: t.id,
          departure: t.departure,
          arrival: t.arrival,
          heure,
          capacity,
          embarked,
          closed,
        });
      });
    });
    return list;
  }, [weeklyTrips, dayName, today, reservationsToday, boardingClosures]);

  const fleetByStatus = useMemo(() => {
    const garage = fleetVehicles.filter((v) => v.status === "garage").length;
    const assigned = fleetVehicles.filter((v) => v.status === "assigned").length;
    const inTransit = agencyLiveState?.vehiclesInTransitCount ?? fleetVehicles.filter((v) => v.status === "in_transit").length;
    const approaching = fleetVehicles.filter(
      (v) =>
        v.status === "in_transit" &&
        agencyId &&
        ((v.destinationAgencyId ?? v.currentAgencyId) === agencyId)
    ).length;
    return { garage, assigned, inTransit, approaching };
  }, [fleetVehicles, agencyId, agencyLiveState?.vehiclesInTransitCount]);

  const alerts = useMemo(() => {
    const list: Array<{ type: string; message: string }> = [];
    closedShifts.forEach((s) => {
      list.push({ type: "session", message: `Session clôturée non validée : ${s.userName ?? s.id}` });
    });
    const inTransitStaleThreshold = 12 * 60 * 60 * 1000;
    const now = Date.now();
    fleetVehicles
      .filter((v) => v.status === "in_transit")
      .forEach((v) => {
        list.push({ type: "fleet", message: `Véhicule en transit depuis longtemps : ${v.plateNumber ?? v.id}` });
      });
    return list;
  }, [closedShifts, fleetVehicles]);

  const topCashier = useMemo((): { shiftId: string; userName?: string; revenue: number } | null => {
    let best: { shiftId: string; userName?: string; revenue: number } | null = null;
    shifts.forEach((s) => {
      const rev = revenueByShift[s.id] ?? 0;
      if (!best || rev > best.revenue) best = { shiftId: s.id, userName: s.userName ?? undefined, revenue: rev };
    });
    return best;
  }, [shifts, revenueByShift]);

  const sessionWarnings = useMemo(() => {
    const list: ShiftDoc[] = [];
    const threshold = SESSION_DURATION_WARNING_HOURS * 60 * 60 * 1000;
    const now = Date.now();
    activeShifts.forEach((s) => {
      const start = s.startTime?.toMillis?.() ?? s.createdAt?.toMillis?.() ?? now;
      if (now - start > threshold) list.push(s);
    });
    return list;
  }, [activeShifts]);

  if (loading) {
    return (
      <StandardLayoutWrapper>
        <p className="text-gray-500">Chargement du tableau de bord…</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-6xl">
      <PageHeader
        title="Tableau de bord Manager"
        subtitle={formatDateLongFr(new Date())}
        icon={LayoutDashboard}
      />

      <SectionCard title="Sessions guichet">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <MetricCard label="Actives" value={activeShiftsCount} valueColorVar="#059669" />
          <MetricCard label="Clôturées (en attente validation)" value={closedPendingCount} valueColorVar="#d97706" />
          <MetricCard label="Validées" value={validatedShiftsCount} valueColorVar="#475569" />
        </div>
        <div className={table.wrapper}>
          <table className={table.base}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Guichetier</th>
                <th className={table.th}>Statut</th>
                <th className={table.thRight}>Revenu</th>
                <th className={table.th}>Alerte</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {shifts.slice(0, 20).map((s) => (
                <tr key={s.id} className={tableRowClassName()}>
                  <td className={table.td}>{s.userName ?? s.userId ?? s.id}</td>
                  <td className={table.td}>{s.status}</td>
                  <td className={table.tdRight}>{revenueByShift[s.id] != null ? `${(revenueByShift[s.id] ?? 0).toFixed(0)}` : "—"}</td>
                  <td className={table.td}>
                    {sessionWarnings.some((w) => w.id === s.id) && (
                      <span className="text-amber-600 text-xs">Session &gt; {SESSION_DURATION_WARNING_HOURS}h</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Embarquement du jour">
        <div className={table.wrapper}>
          <table className={table.base}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Départ → Arrivée</th>
                <th className={table.th}>Heure</th>
                <th className={table.thRight}>Remplissage</th>
                <th className={table.th}>Statut</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {departuresToday.length === 0 ? (
                <tr><td colSpan={4} className="py-4 text-gray-500 text-center">Aucun départ planifié</td></tr>
              ) : (
                departuresToday.map((d, i) => (
                  <tr key={i} className={tableRowClassName()}>
                    <td className={table.td}>{d.departure} → {d.arrival}</td>
                    <td className={table.td}>{d.heure}</td>
                    <td className={table.tdRight}>
                      {d.embarked} / {d.capacity} ({d.capacity ? Math.round((d.embarked / d.capacity) * 100) : 0}%)
                    </td>
                    <td className={table.td}>{d.closed ? "Clôturé" : "Ouvert"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Flotte">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard label="En garage" value={fleetByStatus.garage} valueColorVar="#4b5563" />
          <MetricCard label="Affectés" value={fleetByStatus.assigned} valueColorVar="#d97706" />
          <MetricCard label="En transit" value={fleetByStatus.inTransit} valueColorVar="#2563eb" />
          <MetricCard label="Approchant cette agence" value={fleetByStatus.approaching} valueColorVar="#059669" />
        </div>
      </SectionCard>

      <SectionCard title="Alertes">
        {alerts.length === 0 ? (
          <EmptyState message="Aucune alerte." />
        ) : (
          <ul className="space-y-2">
            {alerts.slice(0, 10).map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                {a.message}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Indicateurs du jour">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <MetricCard
            label="Revenu total (aujourd'hui)"
            value={totalRevenueToday.toFixed(0)}
            valueColorVar="#4f46e5"
          />
          <MetricCard label="Passagers" value={totalPassengersToday} valueColorVar="#7c3aed" />
          <MetricCard
            label="Taux de remplissage"
            value={
              departuresToday.length > 0
                ? `${Math.round(
                    (departuresToday.reduce((a, d) => a + d.embarked, 0) /
                      Math.max(1, departuresToday.reduce((a, d) => a + d.capacity, 0))) * 100
                  )}%`
                : "0%"
            }
            valueColorVar="#0d9488"
          />
          <MetricCard
            label="Meilleur guichetier"
            value={topCashier?.userName ?? "—"}
            valueColorVar="#d97706"
          />
        </div>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default ManagerDashboardPage;
