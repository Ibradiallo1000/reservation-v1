import React, { useEffect, useState, useMemo } from "react";
import {
  collection, doc, query, where, onSnapshot, getDocs, limit, Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { listAccounts, ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import {
  Banknote, Ticket, Gauge, Wallet, Bus,
  AlertTriangle, CheckCircle2, Clock, Monitor,
} from "lucide-react";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, AlertMessage, table, tableRowClassName, typography,
} from "@/ui";
import { useDateFilterContext } from "./DateFilterContext";
import { useManagerAlerts } from "./useManagerAlerts";
import type { DailyStatsDoc, AgencyLiveStateDoc } from "../aggregates/types";

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

export default function ManagerCockpitPage() {
  const { user, company } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const today = useMemo(() => toLocalISO(new Date()), []);
  const dayName = useMemo(() => weekdayFR(new Date()), []);

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];

    unsubs.push(onSnapshot(doc(db, `companies/${companyId}/agences/${agencyId}/dailyStats/${today}`),
      (s) => setDailyStats(s.exists() ? (s.data() as DailyStatsDoc) : null)));
    unsubs.push(onSnapshot(doc(db, `companies/${companyId}/agences/${agencyId}/agencyLiveState/current`),
      (s) => setLiveState(s.exists() ? (s.data() as AgencyLiveStateDoc) : null)));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["active", "paused", "closed", "validated"]), limit(100)),
      (s) => setShifts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
        where("date", "==", today), where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"])),
      (s) => setReservationsToday(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));
    unsubs.push(onSnapshot(collection(db, `companies/${companyId}/agences/${agencyId}/boardingClosures`),
      (s) => setBoardingClosures(new Set(s.docs.map((d) => d.id)))));

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
        title="Dashboard"
        subtitle={format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
        right={
          <DateFilterBar
            preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
            customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
            onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
          />
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard label="Revenu" value={money(filteredRevenue)} icon={Banknote} valueColorVar="#059669" />
        <MetricCard label="Billets vendus" value={filteredTickets} icon={Ticket} valueColorVar="#1d4ed8" />
        <MetricCard label="Taux de remplissage" value={`${avgOccupancy}%`} icon={Gauge} valueColorVar="#7c3aed" />
        <MetricCard label="Position caisse" value={money(cashPosition)} icon={Wallet} valueColorVar="#4f46e5" />
        <MetricCard label="Départs restants" value={departuresRemaining} icon={Bus} valueColorVar="#c2410c" />
      </div>

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

      {alertItems.length > 0 && (
        <SectionCard title="Alertes" icon={AlertTriangle}>
          <div className="space-y-2">
            {alertItems.slice(0, 10).map((a, i) => (
              <AlertMessage key={i} severity={a.severity} message={a.message} />
            ))}
          </div>
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
