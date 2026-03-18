import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  collection, doc, getDoc, query, where, onSnapshot, getDocs, limit,
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
  CheckCircle2, Clock, Monitor, Package,
} from "lucide-react";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table, tableRowClassName, typography,
} from "@/ui";
import { useDateFilterContext } from "./DateFilterContext";
import { useManagerAlerts } from "./useManagerAlerts";
import { buildManagerDecisions, type DecisionEngineResult } from "@/modules/compagnie/commandCenter/decisionEngine";
import type { DailyStatsDoc, AgencyLiveStateDoc } from "../aggregates/types";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { getAgencyStats } from "@/modules/compagnie/networkStats/networkStatsService";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";

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
  const { alerts: managerAlerts, cashVariance } = useManagerAlerts();

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
  /** Ventes par poste (shiftId), même source que le comptable — en temps réel */
  const [liveStatsByShift, setLiveStatsByShift] = useState<Record<string, { tickets: number; revenue: number }>>({});
  const liveUnsubsRef = useRef<Record<string, () => void>>({});

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
    const runEnsure = () =>
      ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom).then(() =>
        listAccounts(companyId, { agencyId }).then((accs) => setCashPosition(accs.reduce((s, a) => s + a.currentBalance, 0))));
    runEnsure().catch((err: any) => {
      if (err?.code === "permission-denied" || err?.message?.includes("permission")) {
        setTimeout(() => runEnsure().catch(() => {}), 1500);
      }
    });

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, today, dayName, company]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const startKey =
      dateFilter.preset === "today"
        ? getTodayBamako()
        : toLocalISO(dateFilter.range.start);
    const endKey =
      dateFilter.preset === "today"
        ? getTodayBamako()
        : toLocalISO(dateFilter.range.end);
    getAgencyStats(companyId, agencyId, startKey, endKey)
      .then((stats) => {
        setFilteredRevenue(stats.totalRevenue);
        setFilteredTickets(stats.totalTickets);
      })
      .catch((err) => {
        console.error("[ManagerCockpit] getAgencyStats failed:", err);
        setFilteredRevenue(0);
        setFilteredTickets(0);
      });
  }, [companyId, agencyId, dateFilter.preset, dateFilter.range.start.getTime(), dateFilter.range.end.getTime()]);

  /* Ventes par poste en temps réel (même logique que le comptable : réservations avec ce shiftId) */
  const activeOrPausedShifts = useMemo(
    () => shifts.filter((s) => s.status === "active" || s.status === "paused"),
    [shifts]
  );
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    for (const id of Object.keys(liveUnsubsRef.current)) {
      const needed = activeOrPausedShifts.some((s) => s.id === id);
      if (!needed) {
        liveUnsubsRef.current[id]?.();
        delete liveUnsubsRef.current[id];
      }
    }
    for (const s of activeOrPausedShifts) {
      if (liveUnsubsRef.current[s.id]) continue;
      const q = query(rRef, where("shiftId", "==", s.id));
      const unsub = onSnapshot(q, (snap) => {
        let tickets = 0;
        let revenue = 0;
        snap.forEach((d) => {
          const r = d.data() as { seatsGo?: number; seatsReturn?: number; montant?: number };
          tickets += (r.seatsGo ?? 0) + (r.seatsReturn ?? 0);
          revenue += r.montant ?? 0;
        });
        setLiveStatsByShift((prev) => ({ ...prev, [s.id]: { tickets, revenue } }));
      });
      liveUnsubsRef.current[s.id] = unsub;
    }
    return () => {
      Object.values(liveUnsubsRef.current).forEach((u) => u());
      liveUnsubsRef.current = {};
    };
  }, [companyId, agencyId, activeOrPausedShifts]);

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
      const live = liveStatsByShift[s.id];
      const fallbackRes = reservationsToday.filter((r) => r.shiftId === s.id);
      return {
        id: s.id,
        name: s.userName ?? s.userId,
        tickets: live ? live.tickets : fallbackRes.reduce((a, r) => a + (r.seatsGo ?? 1), 0),
        revenue: live ? live.revenue : fallbackRes.reduce((a, r) => a + (r.montant ?? 0), 0),
        status: s.status as "active" | "paused",
      };
    }),
    [shifts, reservationsToday, liveStatsByShift]
  );

  const delayThresholdMin = (company as any)?.delayThresholdMinutes ?? 30;
  const delayedDeparturesCount = useMemo(() => {
    const now = Date.now();
    return departures.filter((d) => {
      if (d.closed) return false;
      const [h, m] = d.heure.split(":").map(Number);
      const scheduled = new Date();
      scheduled.setHours(h || 0, m || 0, 0, 0);
      return now > scheduled.getTime() + delayThresholdMin * 60_000;
    }).length;
  }, [departures, delayThresholdMin]);
  const lowFillDeparturesCount = useMemo(
    () => departures.filter((d) => !d.closed && d.capacity > 0 && Math.round((d.embarked / d.capacity) * 100) < 30).length,
    [departures]
  );
  const fullSlotsCount = useMemo(
    () => departures.filter((d) => d.capacity > 0 && Math.round((d.embarked / d.capacity) * 100) >= 80).length,
    [departures]
  );

  const managerDecisions = useMemo((): DecisionEngineResult => {
    return buildManagerDecisions({
      revenue: filteredRevenue,
      tickets: filteredTickets,
      fillRatePct: avgOccupancy,
      cashPosition,
      cashVariance,
      alerts: managerAlerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        description: a.description,
        link: a.link,
      })),
      delayedDeparturesCount,
      lowFillDeparturesCount,
      pendingComptaCount: closedPending.length,
      pendingChefApprovalCount: validatedByCompta.length,
      fullSlotsCount,
      totalSlotsCount: departures.length,
    });
  }, [
    filteredRevenue,
    filteredTickets,
    avgOccupancy,
    cashPosition,
    cashVariance,
    managerAlerts,
    delayedDeparturesCount,
    lowFillDeparturesCount,
    closedPending.length,
    validatedByCompta.length,
    fullSlotsCount,
    departures.length,
  ]);

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

      {/* 1. SITUATION ACTUELLE */}
      <div
        className={[
          "rounded-xl border-2 p-4 flex flex-wrap items-center justify-between gap-4",
          managerDecisions.status === "CRITIQUE" && "border-red-600 bg-red-50 dark:bg-red-950/30 dark:border-red-500",
          managerDecisions.status === "SURVEILLANCE" && "border-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500",
          managerDecisions.status === "BON" && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500",
        ].filter(Boolean).join(" ")}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {managerDecisions.status === "CRITIQUE" ? "🔴" : managerDecisions.status === "SURVEILLANCE" ? "🟠" : "🟢"}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Situation actuelle</h2>
            <ul className="text-sm text-gray-600 dark:text-slate-400 mt-1 list-disc list-inside space-y-0.5">
              {managerDecisions.summary.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="text-lg font-bold text-gray-900 dark:text-white">
          {managerDecisions.status === "CRITIQUE" ? "CRITIQUE" : managerDecisions.status === "SURVEILLANCE" ? "SURVEILLANCE" : "BON"}
        </div>
      </div>

      {/* 2. PROBLÈMES PRIORITAIRES — Score, conséquences, options */}
      {managerDecisions.problems.length > 0 && (
        <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Problèmes prioritaires (triés par score de décision)</h3>
          <ul className="space-y-3">
            {managerDecisions.problems.map((p) => (
              <li key={p.id} className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                    Score {p.score.toLocaleString("fr-FR")}
                  </span>
                  <span className={`text-xs font-medium ${p.level === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {p.level === "danger" ? "Danger" : "Attention"}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mt-1">{p.title}</h4>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1"><strong>Cause :</strong> {p.cause}</p>
                <p className="text-sm text-gray-700 dark:text-slate-300 mt-0.5"><strong>Impact :</strong> {p.impact}</p>
                <div className="mt-2 rounded bg-slate-50 dark:bg-slate-800/50 p-2 text-xs">
                  <p className="text-emerald-700 dark:text-emerald-400"><strong>Si vous agissez :</strong> {p.consequences.ifAction}</p>
                  <p className="text-red-700 dark:text-red-400 mt-1"><strong>Si vous ne faites rien :</strong> {p.consequences.ifNoAction}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-slate-400">
                  <span><strong>Demain :</strong> {p.projection.nextDay.toLocaleString("fr-FR")} FCFA</span>
                  <span><strong>7 jours :</strong> {p.projection.nextWeek.toLocaleString("fr-FR")} FCFA</span>
                </div>
                <p className="text-xs font-medium text-gray-600 dark:text-slate-400 mt-2 mb-1">Options :</p>
                <ul className="space-y-1">
                  {p.options.map((opt, idx) => (
                    <li key={idx} className={`flex flex-wrap items-center gap-2 text-sm ${idx === p.recommendedOptionIndex ? "rounded-md bg-blue-50 dark:bg-blue-900/30 p-2 border border-blue-200 dark:border-blue-700" : ""}`}>
                      {idx === p.recommendedOptionIndex && (
                        <span className="inline-flex items-center rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">Recommandé</span>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(p.actionRoute)}
                        className="text-left text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {opt.label}
                      </button>
                      <span className="text-gray-500 dark:text-slate-500">
                        {opt.estimatedImpact >= 0 ? "+" : ""}{opt.estimatedImpact.toLocaleString("fr-FR")} FCFA
                      </span>
                      <span className={`text-xs ${opt.risk === "low" ? "text-emerald-600" : opt.risk === "medium" ? "text-amber-600" : "text-red-600"}`}>
                        risque {opt.risk === "low" ? "faible" : opt.risk === "medium" ? "moyen" : "élevé"}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-500">
                        · effort {opt.effort === "low" ? "rapide" : opt.effort === "medium" ? "coordination" : "structurel"}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-500">
                        · effet {opt.timeToImpact === "immediate" ? "aujourd'hui" : opt.timeToImpact === "short" ? "1–3 j" : "semaine"}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. OPPORTUNITÉS */}
      {managerDecisions.opportunities.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Opportunités</h3>
          <ul className="space-y-2">
            {managerDecisions.opportunities.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{o.titre}</span>
                <span className="text-emerald-700 dark:text-emerald-300">— {o.preuve}</span>
                <span className="text-gray-600 dark:text-slate-400">→ {o.actionSuggeree}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. À FAIRE MAINTENANT */}
      {managerDecisions.actions.length > 0 && (
        <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-4">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">À faire maintenant</h3>
          <div className="flex flex-wrap gap-2">
            {managerDecisions.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(a.route)}
                className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <SectionCard title="Actions manager">
        <div className="flex flex-wrap gap-2">
          <ActionButton size="sm" onClick={() => navigate("/agence/operations")}>Suivre opérations</ActionButton>
          <ActionButton size="sm" onClick={() => navigate("/agence/finances")}>Arbitrer finances</ActionButton>
          <ActionButton size="sm" onClick={() => navigate("/agence/treasury")}>Voir trésorerie</ActionButton>
          <ActionButton size="sm" variant="secondary" onClick={() => navigate("/agence/reports")}>Consulter rapports</ActionButton>
        </div>
      </SectionCard>

      {/* Guichets actifs — tableau unique (fusion tableau + détail) */}
      <SectionCard title="Guichets actifs — surveillance en temps réel" icon={Monitor}
        right={<StatusBadge status="success">{activeCounters.length} actif{activeCounters.length > 1 ? "s" : ""}</StatusBadge>}
        noPad>
        <div className="px-4 pt-3 pb-1">
          <p className="text-xs text-gray-500">Total agence (en ligne + guichet) puis détail par poste. Même source que le comptable.</p>
        </div>
        {activeCounters.length === 0 && filteredTickets === 0 && filteredRevenue === 0 ? (
          <EmptyState message="Aucun guichet actif et aucune vente sur la période." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Poste / Guichetier</th>
                  <th className={table.thRight}>Billets</th>
                  <th className={table.thRight}>Revenu</th>
                  <th className={table.th}>Statut</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                <tr className={tableRowClassName()} style={{ backgroundColor: "var(--tw-sky-50, #f0f9ff)" }}>
                  <td className={table.td}><span className="font-semibold text-gray-900">Total agence (en ligne + guichet)</span></td>
                  <td className={table.tdRight}>{filteredTickets}</td>
                  <td className={table.tdRight}>{money(filteredRevenue)}</td>
                  <td className={table.td}><span className="text-xs text-gray-500">Réseau TELIYA</span></td>
                </tr>
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

      {/* KPI secondaires — détail */}
      <p className="text-xs text-gray-500 mt-4 mb-2">Indicateurs détaillés — CA et billets : source réseau TELIYA (réservations confirmées/payées).</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 opacity-95">
        <MetricCard label="CA période" value={money(filteredRevenue)} icon={Banknote} valueColorVar="#059669" />
        <MetricCard label="Billets période" value={filteredTickets} icon={Ticket} valueColorVar="#1d4ed8" />
        <MetricCard label="Taux de remplissage" value={`${avgOccupancy}%`} icon={Gauge} valueColorVar="#7c3aed" />
        <MetricCard label="Trésorerie agence" value={money(cashPosition)} icon={Wallet} valueColorVar="#4f46e5" />
        <MetricCard label="Colis créés (jour)" value={courierTodayCount} icon={Package} valueColorVar="#c2410c" />
        <MetricCard label="Colis en transit" value={courierInTransitCount} icon={Package} valueColorVar="#0f766e" />
        <MetricCard label="Départs restants" value={departuresRemaining} icon={Bus} valueColorVar="#c2410c" />
      </div>
    </StandardLayoutWrapper>
  );
}
