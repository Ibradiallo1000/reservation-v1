import { useEffect, useState, useMemo, useRef } from "react";
import {
  collection, query, where, onSnapshot, getDocs, limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { listAccounts, ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { listExpenses } from "@/modules/compagnie/treasury/expenses";

/* ────────────────────────────────────────────────────────
   ALERT TYPES — designed for future extensibility.
   `module` maps to a sidebar section so badges can be
   computed per-section without hard-coding in the shell.

   PERFORMANCE NOTE — Firestore listener inventory:
   This hook subscribes to 3 real-time listeners (shifts,
   today-reservations, boardingClosures) + 1 one-time fetch
   (weeklyTrips) + 1 Promise-based fetch (accounts, expenses).
   Pages that also need this data share the shell's mount and
   will inherently create their own listeners because React
   snapshot hooks must be per-component. Future improvement:
   lift shared data into a React Context to eliminate
   duplicate listeners across pages.
   ──────────────────────────────────────────────────────── */

export type AlertSeverity = "critical" | "warning" | "info";

export type AlertModule = "dashboard" | "operations" | "finances" | "team" | "reports";

export interface ManagerAlert {
  id: string;
  severity: AlertSeverity;
  module: AlertModule;
  title: string;
  description: string;
  /** Path the user should navigate to for resolution */
  link: string;
}

export interface ManagerAlertsResult {
  alerts: ManagerAlert[];
  totalAlertCount: number;
  alertsByModule: Record<AlertModule, ManagerAlert[]>;
  badgeByModule: Record<AlertModule, number>;
  loading: boolean;
}

const SESSION_WARN_H = 8;

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const weekdayFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

export function useManagerAlerts(): ManagerAlertsResult {
  const { user, company } = useAuth() as any;
  const companyId: string = user?.companyId ?? "";
  const agencyId: string = user?.agencyId ?? "";

  const [shifts, setShifts] = useState<any[]>([]);
  const [cashPosition, setCashPosition] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [departures, setDepartures] = useState<Array<{
    key: string; departure: string; arrival: string; heure: string;
    embarked: number; capacity: number; closed: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const tripsRef = useRef<any[]>([]);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];
    const today = toLocalISO(new Date());
    const dayName = weekdayFR(new Date());

    /* Listener 1: shifts */
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["active", "paused", "closed", "validated"]), limit(100)),
      (s) => setShifts(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
    ));

    const resRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    const closuresRef = collection(db, `companies/${companyId}/agences/${agencyId}/boardingClosures`);

    let closuresSet = new Set<string>();
    /* Listener 2: boardingClosures */
    unsubs.push(onSnapshot(closuresRef, (s) => {
      closuresSet = new Set(s.docs.map((d) => d.id));
    }));

    /* One-time fetch: weeklyTrips (cached in ref to avoid refetch on every reservation change) */
    getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`)).then((ts) => {
      tripsRef.current = ts.docs.map((d) => ({ id: d.id, ...d.data() } as any))
        .filter((t: any) => (t.horaires?.[dayName]?.length ?? 0) > 0);
    });

    /* Listener 3: today's reservations */
    unsubs.push(onSnapshot(
      query(resRef, where("date", "==", today), where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"])),
      (snap) => {
        const reservations = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        setTodayRevenue(reservations.reduce((a: number, r: any) => a + (r.montant ?? 0), 0));

        const depList: typeof departures = [];
        tripsRef.current.forEach((t: any) => {
          (t.horaires?.[dayName] ?? []).forEach((heure: string) => {
            const key = `${t.departure}_${t.arrival}_${heure}_${today}`.replace(/\s+/g, "-");
            const resForSlot = reservations.filter((r: any) => r.depart === t.departure && r.arrivee === t.arrival && r.heure === heure);
            const embarked = resForSlot.reduce((a: number, r: any) => a + (r.statutEmbarquement === "embarqué" ? (r.seatsGo ?? 1) : 0), 0);
            depList.push({ key, departure: t.departure, arrival: t.arrival, heure, embarked, capacity: 50, closed: closuresSet.has(key) });
          });
        });
        setDepartures(depList);
      },
    ));

    /* One-time fetch: cash position + today's expenses */
    const currency = (company as any)?.devise ?? "XOF";
    ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom).then(() => {
      listAccounts(companyId, { agencyId }).then((accs) =>
        setCashPosition(accs.reduce((s, a) => s + a.currentBalance, 0)));
    });

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    listExpenses(companyId, { agencyId, status: "pending", limitCount: 200 }).then((list) => {
      const filtered = list.filter((e) => {
        const d = (e as any).createdAt?.toDate?.() ?? new Date();
        return d >= todayStart && d <= todayEnd;
      });
      setTodayExpenses(filtered.reduce((a, e) => a + e.amount, 0));
    });

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, company]);

  const alerts = useMemo(() => {
    const list: ManagerAlert[] = [];
    let idx = 0;

    // Pending reports (finances)
    const closedPending = shifts.filter((s) => s.status === "closed");
    const pendingApproval = shifts.filter((s) => s.status === "validated" && s.lockedComptable && !s.lockedChef);

    if (closedPending.length > 0) {
      list.push({
        id: `pending-compta-${idx++}`,
        severity: "warning",
        module: "finances",
        title: `${closedPending.length} rapport(s) en attente du comptable`,
        description: "Des sessions clôturées attendent la validation comptable.",
        link: "/agence/finances",
      });
    }
    if (pendingApproval.length > 0) {
      list.push({
        id: `pending-chef-${idx++}`,
        severity: "critical",
        module: "finances",
        title: `${pendingApproval.length} rapport(s) à approuver`,
        description: "Des rapports validés par le comptable attendent votre approbation.",
        link: "/agence/finances",
      });
    }

    // Cash variance (finances) — always today-scoped, never date-filter dependent
    const cashVariance = cashPosition - todayRevenue + todayExpenses;
    if (cashVariance !== 0) {
      list.push({
        id: `cash-variance-${idx++}`,
        severity: "critical",
        module: "finances",
        title: "Écart de caisse détecté",
        description: `La caisse présente un écart. Vérifiez les mouvements financiers.`,
        link: "/agence/finances",
      });
    }

    const now = Date.now();

    // No active counter (dashboard)
    const activeCount = shifts.filter((s) => s.status === "active").length;
    if (activeCount === 0 && departures.some((d) => !d.closed)) {
      list.push({
        id: `no-counter-${idx++}`,
        severity: "critical",
        module: "dashboard",
        title: "Aucun guichet actif",
        description: "Des départs sont ouverts mais aucun guichet n'est en service.",
        link: "/agence/dashboard",
      });
    }

    // Delayed departures (operations) — AGGREGATED
    const delayThreshold = (company as any)?.delayThresholdMinutes ?? 30;
    const delayedDeps = departures.filter((d) => {
      if (d.closed) return false;
      const [h, m] = d.heure.split(":").map(Number);
      const scheduled = new Date();
      scheduled.setHours(h || 0, m || 0, 0, 0);
      return Date.now() > scheduled.getTime() + delayThreshold * 60_000;
    });
    if (delayedDeps.length > 0) {
      list.push({
        id: `delayed-agg-${idx++}`,
        severity: "warning",
        module: "operations",
        title: delayedDeps.length === 1
          ? `1 départ en retard`
          : `${delayedDeps.length} départs en retard`,
        description: delayedDeps.length <= 3
          ? delayedDeps.map((d) => `${d.departure} → ${d.arrival} ${d.heure}`).join(" · ")
          : `${delayedDeps.slice(0, 2).map((d) => `${d.departure} → ${d.arrival}`).join(", ")} et ${delayedDeps.length - 2} autre(s)`,
        link: "/agence/operations",
      });
    }

    // Low occupancy (operations) — AGGREGATED
    const lowOccDeps = departures.filter((d) => {
      if (d.closed) return false;
      const pct = d.capacity ? Math.round((d.embarked / d.capacity) * 100) : 0;
      return pct < 30;
    });
    if (lowOccDeps.length > 0) {
      list.push({
        id: `low-occ-agg-${idx++}`,
        severity: "warning",
        module: "operations",
        title: lowOccDeps.length === 1
          ? `1 départ avec faible remplissage`
          : `${lowOccDeps.length} départs avec faible remplissage`,
        description: lowOccDeps.length <= 3
          ? lowOccDeps.map((d) => `${d.departure} → ${d.arrival} ${d.heure}`).join(" · ")
          : `${lowOccDeps.slice(0, 2).map((d) => `${d.departure} → ${d.arrival}`).join(", ")} et ${lowOccDeps.length - 2} autre(s)`,
        link: "/agence/operations",
      });
    }

    // Long sessions — AGGREGATED
    const longSessions = shifts.filter((s) => {
      if (s.status !== "active" && s.status !== "paused") return false;
      const start = s.startTime?.toMillis?.() ?? s.createdAt?.toMillis?.() ?? now;
      return now - start > SESSION_WARN_H * 3600000;
    });
    if (longSessions.length > 0) {
      list.push({
        id: `long-session-agg-${idx++}`,
        severity: "warning",
        module: "dashboard",
        title: longSessions.length === 1
          ? `1 session ouverte > ${SESSION_WARN_H}h`
          : `${longSessions.length} sessions ouvertes > ${SESSION_WARN_H}h`,
        description: longSessions.map((s) => s.userName ?? s.userId).join(", "),
        link: "/agence/dashboard",
      });
    }

    return list;
  }, [shifts, cashPosition, todayRevenue, todayExpenses, departures, company]);

  const alertsByModule = useMemo(() => {
    const grouped: Record<AlertModule, ManagerAlert[]> = {
      dashboard: [], operations: [], finances: [], team: [], reports: [],
    };
    alerts.forEach((a) => grouped[a.module].push(a));
    return grouped;
  }, [alerts]);

  const badgeByModule = useMemo(() => {
    const counts: Record<AlertModule, number> = { dashboard: 0, operations: 0, finances: 0, team: 0, reports: 0 };
    alerts.forEach((a) => counts[a.module]++);
    return counts;
  }, [alerts]);

  return {
    alerts,
    totalAlertCount: alerts.length,
    alertsByModule,
    badgeByModule,
    loading,
  };
}
