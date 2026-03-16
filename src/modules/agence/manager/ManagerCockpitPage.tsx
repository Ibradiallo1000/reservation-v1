import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, doc, getDoc, query, where, onSnapshot, getDocs, limit, Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { activateSession } from "@/modules/agence/services/sessionService";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { listAccounts, ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import {
  Banknote, Ticket, Gauge, Wallet, Bus,
  AlertTriangle, CheckCircle2, Clock, Monitor, Package,
} from "lucide-react";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, AlertMessage, ActionButton, table, tableRowClassName, typography,
} from "@/ui";
import { useDateFilterContext } from "./DateFilterContext";
import { useManagerAlerts } from "./useManagerAlerts";
import type { DailyStatsDoc, AgencyLiveStateDoc } from "../aggregates/types";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";

const SESSION_WARN_H = 8;

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const weekdayFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

type ShiftDoc = {
  id: string; status: string; userId: string; userName?: string | null;
  startTime?: { toMillis?: () => number; toDate?: () => Date } | null;
  endTime?: { toMillis?: () => number } | null;
  createdAt?: { toMillis?: () => number } | null;
  comptable?: { validated?: boolean };
  lockedComptable?: boolean;
};

type ReservationDoc = {
  id: string; montant?: number; seatsGo?: number; shiftId?: string;
  date?: string; depart?: string; arrivee?: string; heure?: string;
  statut?: string; statutEmbarquement?: string; createdAt?: any;
};

type ShipmentRow = {
  createdAt?: { toDate?: () => Date };
  currentStatus?: string;
};

export default function ManagerCockpitPage() {
  const { user, company } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const today = useMemo(() => toLocalISO(new Date()), []);
  const dayName = useMemo(() => weekdayFR(new Date()), []);
  const navigate = useNavigate();

  const dateFilter = useDateFilterContext();
  const { alerts: managerAlerts } = useManagerAlerts();

  const [dailyStats, setDailyStats] = useState<DailyStatsDoc | null>(null);
  const [liveState, setLiveState] = useState<AgencyLiveStateDoc | null>(null);
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [reservationsToday, setReservationsToday] = useState<ReservationDoc[]>([]);
  const [filteredRevenue, setFilteredRevenue] = useState(0);
  const [filteredTickets, setFilteredTickets] = useState(0);
  const [cashPosition, setCashPosition] = useState(0);
  const [weeklyTrips, setWeeklyTrips] = useState<Array<{ id: string; departure: string; arrival: string; horaires?: Record<string, string[]> }>>([]);
  const [boardingClosures, setBoardingClosures] = useState<Set<string>>(new Set());
  const [courierTodayCount, setCourierTodayCount] = useState(0);
  const [courierInTransitCount, setCourierInTransitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agencyType, setAgencyType] = useState<string>("");
  const [activatingShiftId, setActivatingShiftId] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    getDoc(doc(db, `companies/${companyId}/agences/${agencyId}`)).then((snap) => {
      setAgencyType((snap.exists() ? (snap.data() as any)?.type : "") ?? "");
    });
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];

    unsubs.push(onSnapshot(doc(db, `companies/${companyId}/agences/${agencyId}/dailyStats/${today}`),
      (s) => setDailyStats(s.exists() ? (s.data() as DailyStatsDoc) : null)));
    unsubs.push(onSnapshot(doc(db, `companies/${companyId}/agences/${agencyId}/agencyLiveState/current`),
      (s) => setLiveState(s.exists() ? (s.data() as AgencyLiveStateDoc) : null)));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["pending", "active", "paused", "closed", "validated"]), limit(100)),
      (s) => setShifts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
        where("date", "==", today), where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"])),
      (s) => setReservationsToday(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));
    unsubs.push(onSnapshot(collection(db, `companies/${companyId}/agences/${agencyId}/boardingClosures`),
      (s) => setBoardingClosures(new Set(s.docs.map((d) => d.id)))));
    unsubs.push(
      onSnapshot(
        query(shipmentsRef(db, companyId), where("originAgencyId", "==", agencyId), limit(1000)),
        (snap) => {
          const rows = snap.docs.map((d) => d.data() as ShipmentRow);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date();
          todayEnd.setHours(23, 59, 59, 999);
          const createdToday = rows.filter((r) => {
            const created = r.createdAt?.toDate?.();
            return created ? created >= todayStart && created <= todayEnd : false;
          }).length;
          const inTransit = rows.filter((r) => r.currentStatus === "IN_TRANSIT").length;
          setCourierTodayCount(createdToday);
          setCourierInTransitCount(inTransit);
        }
      )
    );

    getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`)).then((s) => {
      setWeeklyTrips(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((t: any) => (t.horaires?.[dayName]?.length ?? 0) > 0));
    });

    const currency = (company as any)?.devise ?? "XOF";
    ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom).then(() => {
      listAccounts(companyId, { agencyId }).then((accs) => setCashPosition(accs.reduce((s, a) => s + a.currentBalance, 0)));
    });

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, today, dayName, company]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    if (dateFilter.preset === "today") {
      setFilteredRevenue(dailyStats?.totalRevenue ?? reservationsToday.reduce((a, r) => a + (r.montant ?? 0), 0));
      setFilteredTickets(dailyStats?.totalPassengers ?? reservationsToday.reduce((a, r) => a + (r.seatsGo ?? 1), 0));
      return;
    }
    const resRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    getDocs(query(resRef, where("createdAt", ">=", Timestamp.fromDate(dateFilter.range.start)),
      where("createdAt", "<=", Timestamp.fromDate(dateFilter.range.end)), where("statut", "in", ["paye", "payé"])))
      .then((s) => {
        setFilteredRevenue(s.docs.reduce((a, d) => a + (d.data().montant ?? 0), 0));
        setFilteredTickets(s.size);
      });
  }, [companyId, agencyId, dateFilter.preset, dateFilter.range.start.getTime(), dateFilter.range.end.getTime(), dailyStats, reservationsToday]);

  const departures = useMemo(() => {
    const list: Array<{ key: string; departure: string; arrival: string; heure: string; embarked: number; capacity: number; closed: boolean }> = [];
    weeklyTrips.forEach((t) => {
      (t.horaires?.[dayName] ?? []).forEach((heure) => {
        const key = `${t.departure}_${t.arrival}_${heure}_${today}`.replace(/\s+/g, "-");
        const resForSlot = reservationsToday.filter((r) => r.depart === t.departure && r.arrivee === t.arrival && r.heure === heure);
        const embarked = resForSlot.reduce((a, r) => a + (r.statutEmbarquement === "embarqué" ? (r.seatsGo ?? 1) : 0), 0);
        list.push({ key, departure: t.departure, arrival: t.arrival, heure, embarked, capacity: 50, closed: boardingClosures.has(key) });
      });
    });
    return list;
  }, [weeklyTrips, dayName, today, reservationsToday, boardingClosures]);

  const avgOccupancy = departures.length > 0
    ? Math.round((departures.reduce((a, d) => a + d.embarked, 0) / Math.max(1, departures.reduce((a, d) => a + d.capacity, 0))) * 100) : 0;
  const departuresRemaining = departures.filter((d) => !d.closed).length;

  const closedPending = useMemo(() => shifts.filter((s) => s.status === "closed"), [shifts]);
  const validatedByCompta = useMemo(() => shifts.filter((s) => s.status === "validated" && s.lockedComptable && !((s as any).lockedChef)), [shifts]);
  const pendingShifts = useMemo(() => shifts.filter((s) => s.status === "pending"), [shifts]);
  const rolesArr: string[] = useMemo(() => {
    const r = (user as any)?.role;
    return Array.isArray(r) ? r : r ? [r] : [];
  }, [user]);
  const isEscaleManager = rolesArr.includes("escale_manager");
  const isEscaleAgency = agencyType === "escale";
  const canActivateShifts = isEscaleAgency && isEscaleManager;

  const handleActivateShift = useCallback(async (shiftId: string) => {
    if (!companyId || !agencyId || !(user as any)?.uid) return;
    setActivatingShiftId(shiftId);
    try {
      await activateSession({
        companyId,
        agencyId,
        shiftId,
        activatedBy: { id: (user as any).uid, name: (user as any).displayName ?? (user as any).nom ?? (user as any).email ?? "Chef d'escale" },
      });
    } catch (e) {
      console.error("[ManagerCockpit] activateSession error:", e);
      alert(e instanceof Error ? e.message : "Erreur lors de l'activation du poste.");
    } finally {
      setActivatingShiftId(null);
    }
  }, [companyId, agencyId, user]);

  const activeCounters = useMemo(() =>
    shifts.filter((s) => s.status === "active" || s.status === "paused").map((s) => {
      const shiftRes = reservationsToday.filter((r) => r.shiftId === s.id);
      return {
        id: s.id, name: s.userName ?? s.userId,
        tickets: shiftRes.reduce((a, r) => a + (r.seatsGo ?? 1), 0),
        revenue: shiftRes.reduce((a, r) => a + (r.montant ?? 0), 0),
        status: s.status as "active" | "paused",
      };
    }), [shifts, reservationsToday]);

  const alertItems = useMemo(() =>
    managerAlerts.filter((a) => a.module === "dashboard" || a.module === "finances" || a.module === "operations")
      .map((a) => ({
        severity: (a.severity === "critical" ? "red" : a.severity === "warning" ? "yellow" : "green") as "red" | "yellow" | "green",
        message: `${a.title} — ${a.description}`,
      })),
  [managerAlerts]);

  if (loading) return <StandardLayoutWrapper><p className={typography.muted}>Chargement du cockpit…</p></StandardLayoutWrapper>;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Poste de pilotage agence"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        right={
          <DateFilterBar
            preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
            customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
            onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
          />
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <MetricCard label="CA période" value={money(filteredRevenue)} icon={Banknote} valueColorVar="#059669" />
        <MetricCard label="Billets période" value={filteredTickets} icon={Ticket} valueColorVar="#1d4ed8" />
        <MetricCard label="Taux de remplissage" value={`${avgOccupancy}%`} icon={Gauge} valueColorVar="#7c3aed" />
        <MetricCard label="Trésorerie agence" value={money(cashPosition)} icon={Wallet} valueColorVar="#4f46e5" />
        <MetricCard label="Colis créés (jour)" value={courierTodayCount} icon={Package} valueColorVar="#c2410c" />
        <MetricCard label="Colis en transit" value={courierInTransitCount} icon={Package} valueColorVar="#0f766e" />
        <MetricCard label="Départs restants" value={departuresRemaining} icon={Bus} valueColorVar="#c2410c" />
      </div>

      <SectionCard title="Actions manager">
        <div className="flex flex-wrap gap-2">
          <ActionButton size="sm" onClick={() => navigate("/agence/operations")}>Suivre opérations</ActionButton>
          <ActionButton size="sm" onClick={() => navigate("/agence/finances")}>Arbitrer finances</ActionButton>
          <ActionButton size="sm" onClick={() => navigate("/agence/treasury")}>Voir trésorerie</ActionButton>
          <ActionButton size="sm" variant="secondary" onClick={() => navigate("/agence/reports")}>Consulter rapports</ActionButton>
        </div>
      </SectionCard>

      <SectionCard title="Guichets actifs" icon={Monitor}
        right={<StatusBadge status="success">{activeCounters.length} actif{activeCounters.length > 1 ? "s" : ""}</StatusBadge>}
        noPad>
        {activeCounters.length === 0 ? (
          <EmptyState message="Aucun guichet actif en ce moment." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Guichetier</th>
                  <th className={table.thRight}>Billets (session)</th>
                  <th className={table.thRight}>Revenu (session)</th>
                  <th className={table.th}>Statut</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {activeCounters.map((c) => (
                  <tr key={c.id} className={tableRowClassName()}>
                    <td className={table.td}><span className="font-medium text-gray-900">{c.name}</span></td>
                    <td className={table.tdRight}>{c.tickets}</td>
                    <td className={table.tdRight}>{money(c.revenue)}</td>
                    <td className={table.td}>
                      {c.status === "active" ? <StatusBadge status="active">Actif</StatusBadge> : <StatusBadge status="pending">En pause</StatusBadge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {activeCounters.length > 0 && (
        <SectionCard title="Postes actifs en temps réel">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeCounters.map((c) => (
              <div key={`card_${c.id}`} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-900 truncate">{c.name}</div>
                  {c.status === "active" ? (
                    <StatusBadge status="active">Actif</StatusBadge>
                  ) : (
                    <StatusBadge status="pending">Pause</StatusBadge>
                  )}
                </div>
                <div className="mt-2 text-xs text-gray-600">Billets session: {c.tickets}</div>
                <div className="text-sm font-medium text-gray-800">Revenu session: {money(c.revenue)}</div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {alertItems.length > 0 && (
        <SectionCard title="Alertes" icon={AlertTriangle}>
          <div className="space-y-2">
            {alertItems.slice(0, 10).map((a, i) => (
              <AlertMessage key={i} severity={a.severity} message={a.message} />
            ))}
          </div>
        </SectionCard>
      )}

      {canActivateShifts && (
        <SectionCard title="Postes en attente d'activation" icon={Clock} noPad>
          {pendingShifts.length === 0 ? (
            <EmptyState message="Aucun poste en attente d'activation." />
          ) : (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Guichetier</th>
                    <th className={table.th}>Créé le</th>
                    <th className={table.th}>Action</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {pendingShifts.map((s) => (
                    <tr key={s.id} className={tableRowClassName()}>
                      <td className={table.td}>{s.userName ?? s.userId}</td>
                      <td className={table.td}>
                        {s.createdAt?.toMillis ? format(new Date(s.createdAt.toMillis()), "dd/MM/yyyy HH:mm") : "—"}
                      </td>
                      <td className={table.td}>
                        <ActionButton
                          size="sm"
                          onClick={() => handleActivateShift(s.id)}
                          disabled={activatingShiftId === s.id}
                        >
                          {activatingShiftId === s.id ? "Activation…" : "Activer"}
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard title="Validations en attente" icon={CheckCircle2} noPad>
        {closedPending.length === 0 && validatedByCompta.length === 0 ? (
          <EmptyState message="Aucune validation en attente." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Guichetier</th>
                  <th className={table.th}>Statut</th>
                  <th className={table.th}>Début</th>
                  <th className={table.thRight}>Revenu</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {[...closedPending, ...validatedByCompta].map((s) => {
                  const rev = reservationsToday.filter((r) => r.shiftId === s.id).reduce((a, r) => a + (r.montant ?? 0), 0);
                  return (
                    <tr key={s.id} className={tableRowClassName()}>
                      <td className={table.td}>{s.userName ?? s.userId}</td>
                      <td className={table.td}>
                        {s.status === "closed"
                          ? <StatusBadge status="pending">En attente compta</StatusBadge>
                          : <StatusBadge status="info">Validé compta — à approuver</StatusBadge>}
                      </td>
                      <td className={table.td}>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {s.startTime?.toMillis ? format(new Date(s.startTime.toMillis()), "HH:mm") : "—"}
                        </span>
                      </td>
                      <td className={table.tdRight}>{money(rev)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
