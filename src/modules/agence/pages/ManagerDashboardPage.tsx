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
      <div className="p-6 max-w-6xl mx-auto">
        <div className="text-gray-500">Chargement du tableau de bord…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Manager</h1>
        <p className="text-sm text-gray-600">{formatDateLongFr(new Date())}</p>

        {/* 1) Live Cashier Sessions */}
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Sessions guichet</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="text-2xl font-bold text-emerald-700">{activeShiftsCount}</div>
              <div className="text-sm text-emerald-800">Actives</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-2xl font-bold text-amber-700">{closedPendingCount}</div>
              <div className="text-sm text-amber-800">Clôturées (en attente validation)</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="text-2xl font-bold text-slate-700">{validatedShiftsCount}</div>
              <div className="text-sm text-slate-800">Validées</div>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Guichetier</th>
                  <th className="text-left py-2">Statut</th>
                  <th className="text-right py-2">Revenu</th>
                  <th className="text-left py-2">Alerte</th>
                </tr>
              </thead>
              <tbody>
                {shifts.slice(0, 20).map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="py-2">{s.userName ?? s.userId ?? s.id}</td>
                    <td className="py-2 capitalize">{s.status}</td>
                    <td className="py-2 text-right">{revenueByShift[s.id] != null ? `${(revenueByShift[s.id] ?? 0).toFixed(0)}` : "—"}</td>
                    <td className="py-2">
                      {sessionWarnings.some((w) => w.id === s.id) && (
                        <span className="text-amber-600 text-xs">Session &gt; {SESSION_DURATION_WARNING_HOURS}h</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 2) Live Boarding Overview */}
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Embarquement du jour</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Départ → Arrivée</th>
                  <th className="text-left py-2">Heure</th>
                  <th className="text-right py-2">Remplissage</th>
                  <th className="text-center py-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {departuresToday.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-gray-500 text-center">Aucun départ planifié</td></tr>
                ) : (
                  departuresToday.map((d, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{d.departure} → {d.arrival}</td>
                      <td className="py-2">{d.heure}</td>
                      <td className="py-2 text-right">
                        {d.embarked} / {d.capacity} ({d.capacity ? Math.round((d.embarked / d.capacity) * 100) : 0}%)
                      </td>
                      <td className="py-2 text-center">{d.closed ? "Clôturé" : "Ouvert"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3) Fleet Status Overview */}
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Flotte</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-gray-100"><div className="font-bold">{fleetByStatus.garage}</div><div className="text-xs text-gray-600">En garage</div></div>
            <div className="p-3 rounded-lg bg-amber-50"><div className="font-bold">{fleetByStatus.assigned}</div><div className="text-xs text-gray-600">Affectés</div></div>
            <div className="p-3 rounded-lg bg-blue-50"><div className="font-bold">{fleetByStatus.inTransit}</div><div className="text-xs text-gray-600">En transit</div></div>
            <div className="p-3 rounded-lg bg-emerald-50"><div className="font-bold">{fleetByStatus.approaching}</div><div className="text-xs text-gray-600">Approchant cette agence</div></div>
          </div>
        </section>

        {/* 4) Alerts Panel */}
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Alertes</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune alerte.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.slice(0, 10).map((a, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {a.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 5) Performance Metrics */}
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Indicateurs du jour</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-100">
              <div className="text-2xl font-bold text-indigo-700">{totalRevenueToday.toFixed(0)}</div>
              <div className="text-sm text-indigo-800">Revenu total (aujourd&apos;hui)</div>
            </div>
            <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
              <div className="text-2xl font-bold text-purple-700">{totalPassengersToday}</div>
              <div className="text-sm text-purple-800">Passagers</div>
            </div>
            <div className="p-4 rounded-lg bg-teal-50 border border-teal-100">
              <div className="text-2xl font-bold text-teal-700">
                {departuresToday.length > 0
                  ? Math.round(
                      (departuresToday.reduce((a, d) => a + d.embarked, 0) /
                        Math.max(1, departuresToday.reduce((a, d) => a + d.capacity, 0))) * 100
                    )
                  : 0}%
              </div>
              <div className="text-sm text-teal-800">Taux de remplissage</div>
            </div>
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-100">
              <div className="text-lg font-bold text-amber-700">{topCashier?.userName ?? "—"}</div>
              <div className="text-sm text-amber-800">Meilleur guichetier (revenu: {topCashier?.revenue?.toFixed(0) ?? "0"})</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ManagerDashboardPage;
