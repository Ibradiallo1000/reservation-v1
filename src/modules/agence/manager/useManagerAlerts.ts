import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  collection, query, where, onSnapshot, getDocs, limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { listCashSessions } from "@/modules/agence/cashControl/cashSessionService";
import { CASH_SESSION_STATUS } from "@/modules/agence/cashControl/cashSessionTypes";
import { listChefIncidents } from "@/modules/agence/manager/incidentStore";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import {
  reconcilePendingCashAgency,
  PENDING_CASH_HIGH_THRESHOLD_FCFA,
  PENDING_REMITTANCE_ALERT_HOURS,
} from "@/modules/agence/comptabilite/pendingCashSafety";
import {
  ACTIVITY_DISCREPANCY_EPSILON,
  courierSessionBusinessDiscrepancy,
  guichetShiftBusinessDiscrepancy,
} from "@/modules/agence/manager/agencyActivityTrackingService";

/* ────────────────────────────────────────────────────────
   ALERT TYPES — designed for future extensibility.
   `module` maps to a sidebar section so badges can be
   computed per-section without hard-coding in the shell.

   PERFORMANCE NOTE — Firestore listener inventory:
   This hook subscribes to 3 real-time listeners (shifts,
   today-reservations, boardingClosures) + 1 one-time fetch
   (weeklyTrips).
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
  dismissAlert: (alertId: string) => void;
  markAllAlertsRead: () => void;
  loading: boolean;
  /** Écart caisse (caisse - ventes du jour + dépenses) pour Decision Engine */
  cashVariance: number;
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
  const userId: string = user?.uid ?? "";

  const [shifts, setShifts] = useState<any[]>([]);
  const [departures, setDepartures] = useState<Array<{
    key: string; departure: string; arrival: string; heure: string;
    embarked: number; capacity: number; closed: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [cashExceptionCount, setCashExceptionCount] = useState(0);
  const [courierDiscrepancyCount, setCourierDiscrepancyCount] = useState(0);
  const [courierLitigeByAgentId, setCourierLitigeByAgentId] = useState<Record<string, number>>({});
  const [openIncidentCount, setOpenIncidentCount] = useState(0);
  const [pendingCashRecon, setPendingCashRecon] = useState<{
    mismatch: boolean;
    diff: number;
    actualPendingBalance: number;
    legacySessionCount: number;
    pendingTooHigh: boolean;
  } | null>(null);

  const tripsRef = useRef<any[]>([]);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<Set<string>>(new Set());
  const alertStorageKey = useMemo(
    () => `teliya:manager-alerts:dismissed:${companyId}:${agencyId}:${userId}`,
    [companyId, agencyId, userId]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(alertStorageKey);
      if (!raw) {
        setDismissedAlertIds(new Set());
        return;
      }
      const parsed = JSON.parse(raw);
      setDismissedAlertIds(new Set(Array.isArray(parsed) ? parsed : []));
    } catch {
      setDismissedAlertIds(new Set());
    }
  }, [alertStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(alertStorageKey, JSON.stringify(Array.from(dismissedAlertIds)));
    } catch {}
  }, [alertStorageKey, dismissedAlertIds]);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];
    const today = toLocalISO(new Date());
    const dayName = weekdayFR(new Date());

    /* Listener 1: shifts */
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["active", "paused", "closed", "validated_agency", "validated"]), limit(100)),
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

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, company]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [closed, suspended] = await Promise.all([
          listCashSessions(companyId, agencyId, { status: CASH_SESSION_STATUS.CLOSED, limitCount: 100 }),
          listCashSessions(companyId, agencyId, { status: CASH_SESSION_STATUS.SUSPENDED, limitCount: 100 }),
        ]);
        if (cancelled) return;
        const withGap = closed.filter((s) => Math.abs(Number(s.discrepancy ?? 0)) > 0.01).length;
        setCashExceptionCount(withGap + suspended.length);
      } catch {
        if (!cancelled) setCashExceptionCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getDocs(query(courierSessionsRef(db, companyId, agencyId), limit(300)));
        if (cancelled) return;
        const byAgent: Record<string, number> = {};
        let count = 0;
        snap.docs.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          if (
            String(x.status ?? "") === "VALIDATED" &&
            courierSessionBusinessDiscrepancy(x) > ACTIVITY_DISCREPANCY_EPSILON
          ) {
            count++;
            const aid = String(x.agentId ?? "");
            if (aid) byAgent[aid] = (byAgent[aid] ?? 0) + 1;
          }
        });
        setCourierDiscrepancyCount(count);
        setCourierLitigeByAgentId(byAgent);
      } catch {
        if (!cancelled) {
          setCourierDiscrepancyCount(0);
          setCourierLitigeByAgentId({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const refresh = () => {
      const incidents = listChefIncidents(companyId, agencyId);
      setOpenIncidentCount(incidents.filter((i) => i.status === "open").length);
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;
    const run = () => {
      void reconcilePendingCashAgency(companyId, agencyId)
        .then((r) => {
          if (cancelled) return;
          setPendingCashRecon({
            mismatch: r.mismatch,
            diff: r.diff,
            actualPendingBalance: r.actualPendingBalance,
            legacySessionCount: r.legacySessionCount,
            pendingTooHigh: r.pendingTooHigh,
          });
        })
        .catch(() => {
          if (!cancelled) setPendingCashRecon(null);
        });
    };
    run();
    const id = setInterval(run, 90_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [companyId, agencyId, shifts.length]);

  const alerts = useMemo(() => {
    const list: ManagerAlert[] = [];
    let idx = 0;

    // Pending reports (finances)
    const closedPending = shifts.filter((s) => s.status === "closed");
    const pendingApproval = shifts.filter((s) => s.status === "validated_agency");

    if (closedPending.length > 0) {
      list.push({
        id: `pending-compta-${idx++}`,
        severity: "warning",
        module: "finances",
        title: `${closedPending.length} rapport(s) en attente du comptable`,
        description: "Des sessions clôturées attendent la validation comptable.",
        link: "/agence/caisse#caisse-sessions",
      });
    }
    if (pendingApproval.length > 0) {
      list.push({
        id: `pending-chef-${idx++}`,
        severity: "critical",
        module: "finances",
        title: `${pendingApproval.length} rapport(s) à approuver`,
        description: "Des rapports validés par le comptable attendent votre approbation.",
        link: "/agence/caisse#caisse-sessions",
      });
    }
    const now = Date.now();

    if (closedPending.length > 0) {
      const staleMs = PENDING_REMITTANCE_ALERT_HOURS * 3600_000;
      const staleClosed = closedPending.filter((s) => {
        const closedMs = s.closedAt?.toMillis?.() ?? s.endTime?.toMillis?.() ?? 0;
        if (closedMs > 0) return now - closedMs > staleMs;
        const startMs = s.startTime?.toMillis?.() ?? s.createdAt?.toMillis?.() ?? 0;
        return startMs > 0 && now - startMs > staleMs;
      });
      if (staleClosed.length > 0) {
        list.push({
          id: `stale-compta-${idx++}`,
          severity: "critical",
          module: "finances",
          title: `${staleClosed.length} session(s) bloquées en attente compta`,
          description: `Aucune validation comptable depuis plus de ${PENDING_REMITTANCE_ALERT_HOURS} h après clôture (remise).`,
          link: "/agence/caisse#caisse-sessions",
        });
      }
    }

    if (pendingCashRecon?.mismatch) {
      list.push({
        id: `pending-recon-mismatch-${idx++}`,
        severity: "critical",
        module: "finances",
        title: "Incohérence caisse « en attente de remise »",
        description: `Écart détecté entre sessions non remises et solde pending (${Math.round(pendingCashRecon.diff).toLocaleString("fr-FR")} FCFA)${
          pendingCashRecon.legacySessionCount > 0 ? " — données legacy possibles (cutoff audit)." : ""
        }.`,
        link: "/agence/caisse#caisse-sessions",
      });
    }
    if (pendingCashRecon?.pendingTooHigh) {
      list.push({
        id: `pending-balance-high-${idx++}`,
        severity: "warning",
        module: "finances",
        title: "Montant pending caisse élevé",
        description: `Solde pending : ${Math.round(pendingCashRecon.actualPendingBalance).toLocaleString("fr-FR")} FCFA (seuil : ${PENDING_CASH_HIGH_THRESHOLD_FCFA.toLocaleString("fr-FR")}).`,
        link: "/agence/caisse#caisse-sessions",
      });
    }

    // No active counter (dashboard)
    const activeCount = shifts.filter((s) => s.status === "active").length;
    if (activeCount === 0 && departures.some((d) => !d.closed)) {
      list.push({
        id: `no-counter-${idx++}`,
        severity: "critical",
        module: "dashboard",
        title: "Aucun guichet actif",
        description: "Des départs sont ouverts mais aucun guichet n'est en service.",
        link: "/agence/activite",
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
        link: "/agence/activite#activite-operations",
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
        link: "/agence/activite#activite-operations",
      });
    }
    if (cashExceptionCount > 0) {
      list.push({
        id: `cash-exceptions-${idx++}`,
        severity: "critical",
        module: "finances",
        title: `${cashExceptionCount} exception(s) de caisse`,
        description: "Écarts ou sessions suspendues détectés.",
        link: "/agence/caisse#caisse-controle",
      });
    }
    if (courierDiscrepancyCount > 0) {
      list.push({
        id: `courier-discrepancies-${idx++}`,
        severity: "critical",
        module: "finances",
        title: `${courierDiscrepancyCount} session(s) courrier avec litige`,
        description: "Écart détecté entre montant compté et montant attendu.",
        link: "/agence/activity-log",
      });
    }

    const guichetLitigeSessions = shifts.filter(
      (s) => guichetShiftBusinessDiscrepancy(s as Record<string, unknown>) > ACTIVITY_DISCREPANCY_EPSILON
    );
    if (guichetLitigeSessions.length > 0) {
      list.push({
        id: `guichet-activity-litiges-${idx++}`,
        severity: "warning",
        module: "dashboard",
        title:
          guichetLitigeSessions.length === 1
            ? "1 session guichet avec écart (contrôle)"
            : `${guichetLitigeSessions.length} sessions guichet avec écart (contrôle)`,
        description: "Écart de caisse ou de déclaration — voir le journal d'activité.",
        link: "/agence/activity-log",
      });
    }

    const guichetLitigeByAgent: Record<string, number> = {};
    guichetLitigeSessions.forEach((s) => {
      const aid = String(s.userId ?? "");
      if (aid) guichetLitigeByAgent[aid] = (guichetLitigeByAgent[aid] ?? 0) + 1;
    });
    const mergedLitigeByAgent: Record<string, number> = { ...courierLitigeByAgentId };
    Object.entries(guichetLitigeByAgent).forEach(([aid, n]) => {
      mergedLitigeByAgent[aid] = (mergedLitigeByAgent[aid] ?? 0) + n;
    });
    const repeatedLitigeAgents = Object.values(mergedLitigeByAgent).filter((n) => n >= 2).length;
    if (repeatedLitigeAgents > 0) {
      list.push({
        id: `agents-repeated-litiges-${idx++}`,
        severity: "critical",
        module: "dashboard",
        title:
          repeatedLitigeAgents === 1
            ? "1 agent avec écarts sur plusieurs sessions"
            : `${repeatedLitigeAgents} agents avec écarts sur plusieurs sessions`,
        description: "Plusieurs sessions présentent un écart pour le même agent (guichet et/ou courrier).",
        link: "/agence/activity-log",
      });
    }
    if (openIncidentCount > 0) {
      list.push({
        id: `open-incidents-${idx++}`,
        severity: "warning",
        module: "finances",
        title: `${openIncidentCount} incident(s) ouverts`,
        description: "Signalements chef en attente de traitement.",
        link: "/agence/caisse#caisse-sessions",
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
        link: "/agence/activite",
      });
    }

    return list;
  }, [
    shifts,
    departures,
    company,
    cashExceptionCount,
    courierDiscrepancyCount,
    courierLitigeByAgentId,
    openIncidentCount,
    pendingCashRecon,
  ]);

  const visibleAlerts = useMemo(
    () => alerts.filter((a) => !dismissedAlertIds.has(a.id)),
    [alerts, dismissedAlertIds]
  );

  useEffect(() => {
    // Keep storage small and consistent with current alert universe
    const currentIds = new Set(alerts.map((a) => a.id));
    setDismissedAlertIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => currentIds.has(id)));
      if (next.size === prev.size) return prev;
      return next;
    });
  }, [alerts]);

  const dismissAlert = useCallback((alertId: string) => {
    setDismissedAlertIds((prev) => {
      if (prev.has(alertId)) return prev;
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });
  }, []);

  const markAllAlertsRead = useCallback(() => {
    setDismissedAlertIds(new Set(alerts.map((a) => a.id)));
  }, [alerts]);

  const alertsByModule = useMemo(() => {
    const grouped: Record<AlertModule, ManagerAlert[]> = {
      dashboard: [], operations: [], finances: [], team: [], reports: [],
    };
    visibleAlerts.forEach((a) => grouped[a.module].push(a));
    return grouped;
  }, [visibleAlerts]);

  const badgeByModule = useMemo(() => {
    const counts: Record<AlertModule, number> = { dashboard: 0, operations: 0, finances: 0, team: 0, reports: 0 };
    visibleAlerts.forEach((a) => counts[a.module]++);
    return counts;
  }, [visibleAlerts]);

  /** Non utilisé pour alertes (indicateur retiré). */
  const cashVariance = 0;

  return {
    alerts: visibleAlerts,
    totalAlertCount: visibleAlerts.length,
    alertsByModule,
    badgeByModule,
    dismissAlert,
    markAllAlertsRead,
    loading,
    cashVariance,
  };
}
