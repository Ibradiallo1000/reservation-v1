import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  collection, doc, getDoc, query, where, onSnapshot, getDocs, limit, Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { activateSession } from "@/modules/agence/services/sessionService";
import { fetchAgencyStaffProfile } from "@/modules/agence/services/agencyStaffProfileService";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { listAccounts, ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import {
  Banknote, Ticket, Wallet, Bus,
  CheckCircle2, Clock, Package, AlertTriangle, Play,
} from "lucide-react";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table, tableRowClassName, typography,
} from "@/ui";
import { useDateFilterContext } from "./DateFilterContext";
import { useManagerAlerts } from "./useManagerAlerts";
import { buildManagerDecisions, type DecisionEngineResult } from "@/modules/compagnie/commandCenter/decisionEngine";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import type { CourierSession } from "@/modules/logistics/domain/courierSession.types";
import { getCourierSessionLedgerTotal } from "@/modules/logistics/services/courierSessionLedger";
import { getAgencyStats } from "@/modules/compagnie/networkStats/networkStatsService";
import { createChefIncident } from "@/modules/agence/manager/incidentStore";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { toast } from "sonner";
import "dayjs/locale/fr";
import { getEndOfDayForDate, getStartOfDayForDate, getTodayForTimezone, resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";
import { cn } from "@/lib/utils";

dayjs.extend(utc);

function reservationMatchesGuichetShift(
  r: { sessionId?: string; shiftId?: string; agentId?: string; guichetierId?: string; paymentChannel?: string; canal?: string },
  s: { id: string; userId?: string }
): boolean {
  const sid = String(r.sessionId ?? r.shiftId ?? "");
  if (sid !== s.id) return false;
  const agent = String(r.agentId ?? r.guichetierId ?? "");
  if (agent !== String(s.userId ?? "")) return false;
  const pc = String(r.paymentChannel ?? "").toLowerCase();
  const canal = String(r.canal ?? "").toLowerCase();
  return pc === "guichet" || canal === "guichet";
}
dayjs.extend(timezone);

type CourierSessionWithId = CourierSession & { id: string };
const ACTION_LABEL_VIEW_DETAILS = "Voir détails";
const ACTION_LABEL_FLAG_ISSUE = "Signaler";
const ACTION_LABEL_SUSPEND_CRITICAL = "Suspendre (critique)";

function fmtSessionClock(v: unknown): string {
  try {
    if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
      return format((v as { toDate: () => Date }).toDate(), "HH:mm", { locale: fr });
    }
    if (v && typeof v === "object" && "seconds" in v) {
      return format(new Date((v as { seconds: number }).seconds * 1000), "HH:mm", { locale: fr });
    }
  } catch {
    /* ignore */
  }
  return "—";
}

/** Relief proche de la vue comptable (billetterie / courrier). */
const COCKPIT_POST_CARD_3D = cn(
  "group relative overflow-hidden rounded-2xl border-2 p-5 outline-none transition-all duration-300 ease-out",
  "shadow-[0_7px_0_rgb(15_23_42/0.1),0_18px_40px_-10px_rgb(15_23_42/0.3),inset_0_2px_0_rgb(255_255_255/0.98),inset_0_-5px_14px_rgb(15_23_42/0.05)]",
  "hover:-translate-y-1.5 hover:shadow-[0_10px_0_rgb(15_23_42/0.08),0_28px_56px_-14px_rgb(15_23_42/0.35),inset_0_2px_0_rgb(255_255_255/1),inset_0_-5px_16px_rgb(15_23_42/0.06)]",
  "active:translate-y-0 active:scale-[0.995] active:shadow-[0_4px_0_rgb(15_23_42/0.11),0_10px_24px_-8px_rgb(15_23_42/0.22),inset_0_4px_10px_rgb(15_23_42/0.07)]"
);

const COCKPIT_AMOUNT_PANEL_3D = cn(
  "mb-0 rounded-xl border-2 p-3",
  "bg-gradient-to-br from-white via-white to-gray-100/95",
  "shadow-[inset_0_4px_12px_rgb(15_23_42/0.08),inset_0_-2px_0_rgb(255_255_255/0.85),0_4px_0_rgb(15_23_42/0.07)]"
);

function cockpitPostCardTintStyle(primary: string, secondary: string): React.CSSProperties {
  return {
    borderColor: `${primary}7A`,
    backgroundImage: `linear-gradient(152deg, ${primary}40 0%, #ffffff 36%, ${secondary}30 78%, #eef2f7 100%)`,
  };
}

const shiftStatusToBadge: Record<string, "active" | "pending" | "success" | "warning" | "neutral"> = {
  active: "active",
  paused: "pending",
  closed: "warning",
  pending: "pending",
  validated_agency: "success",
  validated: "success",
};

const courierStatusToBadge: Record<string, "active" | "pending" | "success" | "warning" | "neutral"> = {
  PENDING: "pending",
  ACTIVE: "active",
  CLOSED: "warning",
  VALIDATED: "success",
};

/** Net des écritures ledger du jour (crédits − débits) sur les comptes agence — fuseau agence. */
async function computeLedgerNetDeltaToday(
  companyId: string,
  dateKeyYmd: string,
  agencyTz: string,
  accountIds: string[]
): Promise<number | null> {
  if (accountIds.length === 0) return 0;
  const start = Timestamp.fromDate(getStartOfDayForDate(dateKeyYmd, agencyTz));
  const end = Timestamp.fromDate(getEndOfDayForDate(dateKeyYmd, agencyTz));
  const movCol = collection(db, `companies/${companyId}/financialTransactions`);
  let delta = 0;
  try {
    for (const accId of accountIds) {
      const [snapTo, snapFrom] = await Promise.all([
        getDocs(query(movCol, where("creditAccountId", "==", accId), where("performedAt", ">=", start), where("performedAt", "<=", end))),
        getDocs(query(movCol, where("debitAccountId", "==", accId), where("performedAt", ">=", start), where("performedAt", "<=", end))),
      ]);
      snapTo.forEach((d) => {
        delta += Number((d.data() as { amount?: number }).amount ?? 0);
      });
      snapFrom.forEach((d) => {
        delta -= Number((d.data() as { amount?: number }).amount ?? 0);
      });
    }
    return delta;
  } catch (e) {
    console.warn("[ManagerCockpit] computeLedgerNetDeltaToday failed", e);
    return null;
  }
}

type ShiftDoc = {
  id: string; status: string; userId: string; userName?: string | null;
  userCode?: string | null;
  startTime?: { toMillis?: () => number; toDate?: () => Date } | null;
  endTime?: { toMillis?: () => number; toDate?: () => Date } | null;
  createdAt?: { toMillis?: () => number } | null;
  comptable?: { validated?: boolean };
  lockedComptable?: boolean;
};

type ReservationDoc = {
  id: string; montant?: number; seatsGo?: number; seatsReturn?: number; shiftId?: string;
  date?: string; depart?: string; arrivee?: string; heure?: string;
  statut?: string; statutEmbarquement?: string; createdAt?: any;
};

type ShipmentRow = {
  createdAt?: { toDate?: () => Date };
  currentStatus?: string;
};

export type ManagerCockpitPageProps = { embedded?: boolean; activityDomainUX?: boolean };

export default function ManagerCockpitPage({
  embedded = false,
  activityDomainUX = false,
}: ManagerCockpitPageProps = {}) {
  const compactActivity = embedded && activityDomainUX;
  const { user, company } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );
  const today = useMemo(() => getTodayForTimezone(agencyTz), [agencyTz]);
  const dayName = useMemo(
    () => dayjs().tz(agencyTz).locale("fr").format("dddd").toLowerCase(),
    [agencyTz]
  );
  const navigate = useNavigate();
  const headerDateLabel = useMemo(
    () => dayjs().tz(agencyTz).locale("fr").format("dddd D MMMM YYYY"),
    [agencyTz]
  );

  const dateFilter = useDateFilterContext();
  const { alerts: managerAlerts } = useManagerAlerts();

  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  const [reservationsToday, setReservationsToday] = useState<ReservationDoc[]>([]);
  /** OPERATIONAL (métier) : CA agrégé réservations via networkStats — pas le ledger. */
  const [filteredRevenue, setFilteredRevenue] = useState(0);
  const [filteredTickets, setFilteredTickets] = useState(0);
  /** FINANCIAL_TRUTH : somme des soldes comptes agence (ledger accounts). */
  const [cashPosition, setCashPosition] = useState(0);
  /** Net écritures financialTransactions aujourd’hui sur ces comptes (null = indisponible). */
  const [ledgerDeltaToday, setLedgerDeltaToday] = useState<number | null>(null);
  const [weeklyTrips, setWeeklyTrips] = useState<Array<{ id: string; departure: string; arrival: string; horaires?: Record<string, string[]> }>>([]);
  const [boardingClosures, setBoardingClosures] = useState<Set<string>>(new Set());
  const [courierTodayCount, setCourierTodayCount] = useState(0);
  const [courierInTransitCount, setCourierInTransitCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [agencyType, setAgencyType] = useState<string>("");
  const [activatingShiftId, setActivatingShiftId] = useState<string | null>(null);
  /** Par poste guichet : même agrégation que la compta (résas + billets + CA liés au shiftId). */
  const [liveStatsByShift, setLiveStatsByShift] = useState<
    Record<string, { reservations: number; tickets: number; revenue: number }>
  >({});
  const liveUnsubsRef = useRef<Record<string, () => void>>({});
  const [guichetStaffCache, setGuichetStaffCache] = useState<Record<string, { name?: string; code?: string }>>({});
  const [activeCourierSessions, setActiveCourierSessions] = useState<CourierSessionWithId[]>([]);
  const [pendingCourierSessions, setPendingCourierSessions] = useState<CourierSessionWithId[]>([]);
  const [courierSessionStats, setCourierSessionStats] = useState<Record<string, { total: number; paid: number }>>({});
  const [courierLedgerBySessionId, setCourierLedgerBySessionId] = useState<Record<string, number>>({});
  const courierShipUnsubsRef = useRef<Record<string, () => void>>({});
  const [courierStaffCache, setCourierStaffCache] = useState<Record<string, { name?: string; code?: string }>>({});
  const [flagModalSessionId, setFlagModalSessionId] = useState<string | null>(null);
  const [flagReason, setFlagReason] = useState("");
  const [suspendModalSessionId, setSuspendModalSessionId] = useState<string | null>(null);
  const [suspendReason, setSuspendReason] = useState("");

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    getDoc(doc(db, `companies/${companyId}/agences/${agencyId}`)).then((snap) => {
      setAgencyType((snap.exists() ? (snap.data() as any)?.type : "") ?? "");
    });
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];

    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["pending", "active", "paused", "closed", "validated_agency", "validated"]), limit(100)),
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
          const start = dayjs().tz(agencyTz).startOf("day").toDate();
          const end = dayjs().tz(agencyTz).endOf("day").toDate();
          const createdToday = rows.filter((r) => {
            const created = r.createdAt?.toDate?.();
            return created ? created >= start && created <= end : false;
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
    const dateKeyForLedger = getTodayForTimezone(agencyTz);
    const runEnsure = () =>
      ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom).then(() =>
        listAccounts(companyId, { agencyId }).then(async (accs) => {
          setCashPosition(accs.reduce((s, a) => s + a.currentBalance, 0));
          setLedgerDeltaToday(null);
          const ids = accs.map((a) => a.id);
          const net = await computeLedgerNetDeltaToday(companyId, dateKeyForLedger, agencyTz, ids);
          setLedgerDeltaToday(net);
        }));
    runEnsure().catch((err: any) => {
      setLedgerDeltaToday(null);
      if (err?.code === "permission-denied" || err?.message?.includes("permission")) {
        setTimeout(() => runEnsure().catch(() => setLedgerDeltaToday(null)), 1500);
      }
    });

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, today, dayName, company, agencyTz]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const startKey =
      dateFilter.preset === "today"
        ? getTodayForTimezone(agencyTz)
        : dayjs(dateFilter.range.start).tz(agencyTz).format("YYYY-MM-DD");
    const endKey =
      dateFilter.preset === "today"
        ? getTodayForTimezone(agencyTz)
        : dayjs(dateFilter.range.end).tz(agencyTz).format("YYYY-MM-DD");
    getAgencyStats(companyId, agencyId, startKey, endKey, agencyTz)
      .then((stats) => {
        setFilteredRevenue(stats.totalRevenue);
        setFilteredTickets(stats.totalTickets);
      })
      .catch((err) => {
        console.error("[ManagerCockpit] getAgencyStats failed:", err);
        setFilteredRevenue(0);
        setFilteredTickets(0);
      });
  }, [companyId, agencyId, agencyTz, dateFilter.preset, dateFilter.range.start.getTime(), dateFilter.range.end.getTime()]);

  /* Ventes par poste en temps réel (même logique que le comptable : réservations avec ce shiftId) */
  const activeOrPausedShifts = useMemo(
    () => shifts.filter((s) => s.status === "active" || s.status === "paused"),
    [shifts]
  );
  const activePausedShiftIdsKey = useMemo(
    () => activeOrPausedShifts.map((s) => s.id).sort().join(","),
    [activeOrPausedShifts]
  );

  useEffect(() => {
    if (!companyId || !agencyId) {
      for (const id of Object.keys(liveUnsubsRef.current)) {
        try {
          liveUnsubsRef.current[id]?.();
        } catch {
          /* ignore */
        }
        delete liveUnsubsRef.current[id];
      }
      return;
    }
    const list = shiftsRef.current.filter((s) => s.status === "active" || s.status === "paused");
    const wanted = new Set(list.map((s) => s.id));
    const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
    const cur = liveUnsubsRef.current;
    for (const id of Object.keys(cur)) {
      if (!wanted.has(id)) {
        try {
          cur[id]?.();
        } catch {
          /* ignore */
        }
        delete cur[id];
      }
    }
    for (const s of list) {
      if (cur[s.id]) continue;
      const q = query(rRef, where("sessionId", "==", s.id));
      cur[s.id] = onSnapshot(q, (snap) => {
        let tickets = 0;
        let revenue = 0;
        snap.forEach((docSnap) => {
          const r = docSnap.data() as {
            seatsGo?: number;
            seatsReturn?: number;
            montant?: number;
            paymentChannel?: string;
            canal?: string;
            agentId?: string;
            guichetierId?: string;
          };
          const agent = String(r.agentId ?? r.guichetierId ?? "");
          if (agent !== String(s.userId ?? "")) return;
          if (String(r.paymentChannel ?? "").toLowerCase() !== "guichet" && String(r.canal ?? "").toLowerCase() !== "guichet") {
            return;
          }
          tickets += (r.seatsGo ?? 0) + (r.seatsReturn ?? 0);
          revenue += r.montant ?? 0;
        });
        const reservations = snap.size;
        setLiveStatsByShift((prev) => ({ ...prev, [s.id]: { reservations, tickets, revenue } }));
      });
    }
  }, [companyId, agencyId, activePausedShiftIdsKey]);

  useEffect(
    () => () => {
      for (const id of Object.keys(liveUnsubsRef.current)) {
        try {
          liveUnsubsRef.current[id]?.();
        } catch {
          /* ignore */
        }
        delete liveUnsubsRef.current[id];
      }
    },
    []
  );

  /* Sessions courrier (temps réel) — même collection que la compta agence */
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const col = courierSessionsRef(db, companyId, agencyId);
    const unsub = onSnapshot(col, (snap) => {
      const all = snap.docs.map((d) => ({ ...d.data(), id: d.id } as CourierSessionWithId));
      const byTime = (s: CourierSessionWithId) =>
        (s.validatedAt as { toMillis?: () => number })?.toMillis?.() ??
        (s.closedAt as { toMillis?: () => number })?.toMillis?.() ??
        (s.openedAt as { toMillis?: () => number })?.toMillis?.() ??
        (s.createdAt as { toMillis?: () => number })?.toMillis?.() ??
        0;
      setPendingCourierSessions(all.filter((s) => s.status === "PENDING").sort((a, b) => byTime(b) - byTime(a)));
      setActiveCourierSessions(all.filter((s) => s.status === "ACTIVE").sort((a, b) => byTime(b) - byTime(a)));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  const courierShipmentWatchKey = useMemo(
    () =>
      [...new Set([...pendingCourierSessions, ...activeCourierSessions].map((s) => s.id))].sort().join(","),
    [pendingCourierSessions, activeCourierSessions]
  );

  useEffect(() => {
    if (!companyId) return;
    const wanted = new Set(courierShipmentWatchKey ? courierShipmentWatchKey.split(",").filter(Boolean) : []);
    const cur = courierShipUnsubsRef.current;
    for (const id of Object.keys(cur)) {
      if (!wanted.has(id)) {
        try {
          cur[id]?.();
        } catch {
          /* ignore */
        }
        delete cur[id];
      }
    }
    for (const id of wanted) {
      if (cur[id]) continue;
      const qSh = query(shipmentsRef(db, companyId), where("sessionId", "==", id));
      cur[id] = onSnapshot(
        qSh,
        (snap) => {
          let paid = 0;
          for (const d of snap.docs) {
            const ps = (d.data() as { paymentStatus?: string }).paymentStatus;
            if (ps && ps !== "UNPAID") paid += 1;
          }
          setCourierSessionStats((p) => ({ ...p, [id]: { total: snap.docs.length, paid } }));
        },
        () => {}
      );
    }
  }, [companyId, courierShipmentWatchKey]);

  useEffect(() => {
    if (!companyId) return;
    const ids = [...new Set([...pendingCourierSessions, ...activeCourierSessions].map((s) => s.id))];
    if (ids.length === 0) {
      setCourierLedgerBySessionId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: Record<string, number> = {};
      for (const id of ids) {
        try {
          next[id] = await getCourierSessionLedgerTotal(companyId, id);
        } catch {
          next[id] = 0;
        }
      }
      if (!cancelled) setCourierLedgerBySessionId(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, pendingCourierSessions, activeCourierSessions]);

  const courierAgentIdsKey = useMemo(
    () =>
      [...new Set([...pendingCourierSessions, ...activeCourierSessions].map((s) => s.agentId).filter(Boolean))].sort().join(","),
    [pendingCourierSessions, activeCourierSessions]
  );

  useEffect(() => {
    if (!companyId || !agencyId || !courierAgentIdsKey) return;
    const agentIds = courierAgentIdsKey.split(",").filter(Boolean);
    void (async () => {
      const entries = await Promise.all(
        agentIds.map(async (uid) => {
          try {
            const profile = await fetchAgencyStaffProfile(companyId, agencyId, uid);
            return [uid, { name: profile.name, code: profile.code }] as const;
          } catch {
            return [uid, {}] as const;
          }
        })
      );
      setCourierStaffCache((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [companyId, agencyId, courierAgentIdsKey]);

  const guichetSellerIdsKey = useMemo(
    () => [...new Set(activeOrPausedShifts.map((s) => s.userId).filter(Boolean))].sort().join(","),
    [activeOrPausedShifts]
  );

  useEffect(() => {
    if (!companyId || !agencyId || !guichetSellerIdsKey) return;
    const uids = guichetSellerIdsKey.split(",").filter(Boolean);
    void (async () => {
      const entries = await Promise.all(
        uids.map(async (uid) => {
          try {
            const profile = await fetchAgencyStaffProfile(companyId, agencyId, uid);
            return [uid, { name: profile.name, code: profile.code }] as const;
          } catch {
            return [uid, {}] as const;
          }
        })
      );
      setGuichetStaffCache((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [companyId, agencyId, guichetSellerIdsKey]);

  /** Créneaux du jour agence (clôture embarquement) — vue opérationnelle, hors ventes comptables. */
  const departures = useMemo(() => {
    const list: Array<{ key: string; closed: boolean }> = [];
    weeklyTrips.forEach((t) => {
      (t.horaires?.[dayName] ?? []).forEach((heure) => {
        const key = `${t.departure}_${t.arrival}_${heure}_${today}`.replace(/\s+/g, "-");
        list.push({ key, closed: boardingClosures.has(key) });
      });
    });
    return list;
  }, [weeklyTrips, dayName, today, boardingClosures]);

  const departuresRemaining = departures.filter((d) => !d.closed).length;

  const closedPending = useMemo(() => shifts.filter((s) => s.status === "closed"), [shifts]);
  const validatedByCompta = useMemo(() => shifts.filter((s) => s.status === "validated" && s.lockedComptable && !((s as any).lockedChef)), [shifts]);
  /** File validation : urgences chef d’abord, puis attente compta. */
  const sessionsQueueOrdered = useMemo(
    () => [...validatedByCompta, ...closedPending],
    [validatedByCompta, closedPending]
  );
  const pendingShifts = useMemo(() => shifts.filter((s) => s.status === "pending"), [shifts]);
  const rolesArr: string[] = useMemo(() => {
    const r = (user as any)?.role;
    return Array.isArray(r) ? r : r ? [r] : [];
  }, [user]);
  const isEscaleManager = rolesArr.includes("escale_manager");
  const isEscaleAgency = agencyType === "escale";
  const canActivateShifts = isEscaleAgency && isEscaleManager;

  const urgentChefQueueCount = validatedByCompta.length;
  const waitComptaQueueCount = closedPending.length;
  const waitActivationQueueCount = canActivateShifts ? pendingShifts.length : 0;
  const queueEntirelyClear =
    urgentChefQueueCount === 0 && waitComptaQueueCount === 0 && waitActivationQueueCount === 0;

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

  const activeCounters = useMemo(
    () =>
      shifts
        .filter((s) => s.status === "active" || s.status === "paused")
        .map((s) => {
          const live = liveStatsByShift[s.id];
          const fallbackRes = reservationsToday.filter((r) => reservationMatchesGuichetShift(r, s));
          const staff = guichetStaffCache[s.userId];
          const displayName = (staff?.name && staff.name.trim()) || s.userName || s.userId;
          const code = String(staff?.code || s.userCode || "").trim() || "—";
          const reservations = live?.reservations ?? fallbackRes.length;
          const tickets = live
            ? live.tickets
            : fallbackRes.reduce((a, r) => a + (r.seatsGo ?? 1) + (r.seatsReturn ?? 0), 0);
          const revenue = live ? live.revenue : fallbackRes.reduce((a, r) => a + (r.montant ?? 0), 0);
          return {
            id: s.id,
            shift: s,
            displayName,
            code,
            reservations,
            tickets,
            revenue,
            status: s.status as "active" | "paused",
          };
        }),
    [shifts, reservationsToday, liveStatsByShift, guichetStaffCache]
  );

  const cockpitTheme = useMemo(
    () => ({
      primary: String((company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#2563eb"),
      secondary: String((company as { couleurSecondaire?: string })?.couleurSecondaire ?? "#7c3aed"),
    }),
    [company]
  );

  const shiftStatusLabels: Record<string, string> = {
    active: "En service",
    paused: "En pause",
    closed: "Clôturé",
    pending: "En attente",
    validated_agency: "Validé agence (en attente chef)",
    validated: "Validé",
  };

  const hasCourierLiveSessions = pendingCourierSessions.length + activeCourierSessions.length > 0;

  const openFlagIssue = (sessionId: string) => {
    setFlagModalSessionId(sessionId);
    setFlagReason("");
  };

  const submitFlagIssue = () => {
    if (!flagModalSessionId) return;
    const reason = flagReason.trim();
    if (!reason) {
      alert("Motif requis.");
      return;
    }
    try {
      createChefIncident(companyId, agencyId, {
        status: "open",
        severity: "warning",
        createdBy: { id: (user as any)?.uid ?? "unknown", name: (user as any)?.displayName ?? undefined },
        reason,
        relatedSessionId: flagModalSessionId,
        source: "activity",
        type: "flag",
      });
      setFlagModalSessionId(null);
      setFlagReason("");
      toast.info("Action disponible dans Caisse");
      navigate("/agence/caisse#caisse-sessions");
    } catch {
      alert("Impossible d'enregistrer le signalement.");
    }
  };

  const submitSuspendRequest = () => {
    if (!suspendModalSessionId) return;
    const reason = suspendReason.trim();
    if (!reason) {
      alert("Motif requis.");
      return;
    }
    try {
      createChefIncident(companyId, agencyId, {
        status: "open",
        severity: "critical",
        createdBy: { id: (user as any)?.uid ?? "unknown", name: (user as any)?.displayName ?? undefined },
        reason,
        relatedSessionId: suspendModalSessionId,
        source: "activity",
        type: "suspend_request",
      });
      setSuspendModalSessionId(null);
      setSuspendReason("");
      toast.info("Action disponible dans Caisse");
      navigate("/agence/caisse#caisse-controle");
    } catch {
      alert("Impossible d'enregistrer la demande de suspension.");
    }
  };

  /** Statut synthétique : alertes + file d’attente sessions (sans KPI trompeurs ni projections en UI). */
  const managerDecisions = useMemo((): DecisionEngineResult => {
    return buildManagerDecisions({
      revenue: filteredRevenue,
      tickets: filteredTickets,
      fillRatePct: null,
      cashPosition,
      cashVariance: 0,
      alerts: managerAlerts.map((a) => ({
        id: a.id,
        severity: a.severity,
        title: a.title,
        description: a.description,
        link: a.link,
      })),
      delayedDeparturesCount: 0,
      lowFillDeparturesCount: 0,
      pendingComptaCount: closedPending.length,
      pendingChefApprovalCount: validatedByCompta.length,
      fullSlotsCount: 0,
      totalSlotsCount: departures.length,
    });
  }, [
    filteredRevenue,
    filteredTickets,
    cashPosition,
    managerAlerts,
    closedPending.length,
    validatedByCompta.length,
    departures.length,
  ]);
  const hasCriticalIssues =
    managerDecisions.status === "CRITIQUE" ||
    managerAlerts.some((a) => a.severity === "critical") ||
    pendingShifts.length > 0;

  const alertesOpenDefault =
    managerAlerts.some((a) => a.severity === "critical") || managerDecisions.status === "CRITIQUE";

  if (loading) {
    return embedded ? (
      <div className="py-4"><p className={typography.muted}>Chargement du cockpit…</p></div>
    ) : (
      <StandardLayoutWrapper><p className={typography.muted}>Chargement du cockpit…</p></StandardLayoutWrapper>
    );
  }

  const periodHint =
    dateFilter.preset === "today"
      ? `Journée agence (${agencyTz}) — ventes (createdAt).`
      : "Période personnalisée — ventes filtrées par createdAt (fuseau agence).";

  const dateFilterBar = (
    <DateFilterBar
      preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
      customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
      onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
    />
  );

  const content = (
    <>
      {embedded ? (
        compactActivity ? (
          <div className="mb-3 flex flex-wrap items-center justify-end gap-2">{dateFilterBar}</div>
        ) : (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Synthèse agence</h2>
            {dateFilterBar}
          </div>
        )
      ) : (
        <PageHeader
          title="Poste de pilotage agence"
          subtitle={headerDateLabel}
          right={dateFilterBar}
        />
      )}

      {/* 1. Situation globale */}
      {compactActivity ? (
        <>
          <div
            className={cn(
              "mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 p-3",
              managerDecisions.status === "CRITIQUE" && "border-red-600 bg-red-50 dark:border-red-500 dark:bg-red-950/30",
              managerDecisions.status === "SURVEILLANCE" && "border-amber-600 bg-amber-50 dark:border-amber-500 dark:bg-amber-950/30",
              managerDecisions.status === "BON" && "border-emerald-600 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/30"
            )}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xl" aria-hidden>
                {managerDecisions.status === "CRITIQUE" ? "🔴" : managerDecisions.status === "SURVEILLANCE" ? "🟠" : "🟢"}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Aujourd&apos;hui</h2>
                <p className="text-xs text-gray-600 dark:text-slate-400">
                  {managerAlerts.length} alerte{managerAlerts.length !== 1 ? "s" : ""} · {departuresRemaining} créneau
                  {departuresRemaining !== 1 ? "x" : ""} ouverts · {closedPending.length} session
                  {closedPending.length !== 1 ? "s" : ""} compta
                  {validatedByCompta.length > 0 ? ` · ${validatedByCompta.length} à valider` : ""}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-sm font-bold text-gray-900 dark:text-white">
              {managerDecisions.status === "CRITIQUE"
                ? "Critique"
                : managerDecisions.status === "SURVEILLANCE"
                  ? "Surveillance"
                  : "OK"}
            </div>
          </div>
          <details className="mb-4 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 text-xs text-gray-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            <summary className="cursor-pointer font-medium text-gray-700 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
              Fuseau &amp; détail files
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-0.5 pl-0.5">
              <li>Fuseau : {agencyTz}</li>
              <li>En attente compta : {closedPending.length}</li>
              <li>À votre validation : {validatedByCompta.length}</li>
            </ul>
          </details>
        </>
      ) : (
        <div
          className={[
            "rounded-xl border-2 p-4 flex flex-wrap items-center justify-between gap-4 mb-4",
            managerDecisions.status === "CRITIQUE" && "border-red-600 bg-red-50 dark:bg-red-950/30 dark:border-red-500",
            managerDecisions.status === "SURVEILLANCE" && "border-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500",
            managerDecisions.status === "BON" && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-2xl shrink-0" aria-hidden>
              {managerDecisions.status === "CRITIQUE" ? "🔴" : managerDecisions.status === "SURVEILLANCE" ? "🟠" : "🟢"}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Situation globale</h2>
              <ul className="text-sm text-gray-600 dark:text-slate-400 mt-1 list-disc list-inside space-y-0.5">
                <li>Fuseau agence : {agencyTz}</li>
                <li>Alertes actives : {managerAlerts.length}</li>
                <li>
                  Sessions — en attente compta : {closedPending.length}
                  {validatedByCompta.length > 0 ? ` · à votre validation : ${validatedByCompta.length}` : ""}
                </li>
                <li>Créneaux embarquement non clôturés (aujourd&apos;hui) : {departuresRemaining}</li>
              </ul>
            </div>
          </div>
          <div className="text-lg font-bold text-gray-900 dark:text-white shrink-0">
            {managerDecisions.status === "CRITIQUE" ? "CRITIQUE" : managerDecisions.status === "SURVEILLANCE" ? "SURVEILLANCE" : "BON"}
          </div>
        </div>
      )}

      {embedded && !compactActivity ? (
        <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">
          Sessions guichet à valider :{" "}
          <Link to="/agence/caisse#caisse-sessions" className="font-medium text-indigo-600 underline dark:text-indigo-400">
            ouvrir Caisse
          </Link>
          {" · "}
          <Link to="/agence/reports" className="font-medium text-indigo-600 underline dark:text-indigo-400">
            Rapports
          </Link>
        </p>
      ) : !embedded ? (
        <div className="flex flex-wrap gap-2 mb-6">
          <ActionButton size="sm" onClick={() => navigate("/agence/activite#activite-operations")}>Opérations</ActionButton>
          <ActionButton size="sm" onClick={() => navigate("/agence/caisse")}>Caisse</ActionButton>
          <ActionButton size="sm" variant="secondary" onClick={() => navigate("/agence/reports")}>Rapports</ActionButton>
        </div>
      ) : null}

      {/* 2. Activité (ventes) — non comptabilisée */}
      {compactActivity ? (
        <details className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <Banknote className="h-4 w-4 text-emerald-600" aria-hidden />
              Ventes (période)
            </span>
            <span className="text-xs font-normal tabular-nums text-gray-500 dark:text-slate-400">
              {money(filteredRevenue)} · {filteredTickets} billet{filteredTickets !== 1 ? "s" : ""}
            </span>
          </summary>
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800">
            <p className="mb-3 text-xs text-gray-500 dark:text-slate-400">{periodHint}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard label="Montant (ventes terrain)" value={money(filteredRevenue)} icon={Banknote} valueColorVar="#059669" />
              <MetricCard label="Billets vendus (période)" value={filteredTickets} icon={Ticket} valueColorVar="#1d4ed8" />
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Package className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
                Courrier : {courierTodayCount} · {courierInTransitCount} transit
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Bus className="h-4 w-4 shrink-0 text-orange-700" aria-hidden />
                Créneaux ouverts : {departuresRemaining}
              </span>
            </div>
          </div>
        </details>
      ) : (
        <SectionCard
          title={embedded ? "Ventes (période)" : "Activité (non comptabilisée)"}
          icon={Banknote}
          className="mb-4"
        >
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">{periodHint}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard label="Montant (ventes terrain)" value={money(filteredRevenue)} icon={Banknote} valueColorVar="#059669" />
            <MetricCard label="Billets vendus (période)" value={filteredTickets} icon={Ticket} valueColorVar="#1d4ed8" />
          </div>
          {!embedded && (
            <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
              Source : réservations vendues, filtre <strong>createdAt</strong> dans le fuseau agence (même règle que le réseau). À ne pas confondre avec la comptabilité ou le ledger.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-4 w-4 shrink-0 text-orange-600" aria-hidden />
              Courrier (jour agence) : {courierTodayCount} créé{courierTodayCount > 1 ? "s" : ""} · {courierInTransitCount} en transit
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Bus className="h-4 w-4 shrink-0 text-orange-700" aria-hidden />
              Embarquement : {departuresRemaining} créneau{departuresRemaining > 1 ? "x" : ""} non clôturé{departuresRemaining > 1 ? "s" : ""}
            </span>
          </div>
        </SectionCard>
      )}

      {/* 3. Trésorerie (ledger) — masqué dans le domaine Activité (détail dans Caisse) */}
      {!embedded && (
      <SectionCard title="Position financière (ledger)" icon={Wallet} className="mb-4">
        <MetricCard label="Solde agrégé des comptes agence" value={money(cashPosition)} icon={Wallet} valueColorVar="#4f46e5" />
        {ledgerDeltaToday !== null && (
          <div
            className={cn(
              "mt-3 rounded-lg border px-3 py-2 text-sm",
              ledgerDeltaToday > 0 && "border-emerald-200 bg-emerald-50/80 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100",
              ledgerDeltaToday < 0 && "border-red-200 bg-red-50/80 text-red-900 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100",
              ledgerDeltaToday === 0 && "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/50 dark:text-slate-200"
            )}
          >
            <span className="font-medium">Variation du jour (ledger)</span>
            <span className="mx-1">:</span>
            <span className="font-semibold tabular-nums">
              {ledgerDeltaToday > 0 ? "+" : ledgerDeltaToday < 0 ? "−" : ""}
              {money(Math.abs(ledgerDeltaToday))}
            </span>
            <span className="text-xs font-normal text-gray-500 dark:text-slate-400 ml-1">
              (mouvements sur comptes agence, fuseau {agencyTz})
            </span>
          </div>
        )}
        <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">
          Somme des soldes des comptes financiers de l&apos;agence (grand livre). Indépendant du filtre de période des ventes ci-dessus.
        </p>
      </SectionCard>
      )}

      {/* 4. File d&apos;attente (sessions) */}
      {embedded ? (
        canActivateShifts && pendingShifts.length > 0 ? (
          <SectionCard title="Activation des postes (escale)" icon={CheckCircle2} className="mb-4" noPad>
            <div className="px-4 pt-3 pb-2 text-xs text-gray-500 dark:text-slate-400">
              {compactActivity ? (
                <>
                  Suite compta :{" "}
                  <Link to="/agence/caisse#caisse-sessions" className="font-medium text-indigo-600 underline dark:text-indigo-400">
                    Caisse
                  </Link>
                </>
              ) : (
                <>
                  Les validations de sessions après comptable se font dans{" "}
                  <Link to="/agence/caisse#caisse-sessions" className="text-indigo-600 underline dark:text-indigo-400">
                    Caisse
                  </Link>
                  .
                </>
              )}
            </div>
            <div className="px-4 pb-3">
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
                          <ActionButton size="sm" onClick={() => handleActivateShift(s.id)} disabled={activatingShiftId === s.id}>
                            {activatingShiftId === s.id ? "Activation…" : "Activer"}
                          </ActionButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </SectionCard>
        ) : null
      ) : (
      <SectionCard title="File d&apos;attente — sessions" icon={CheckCircle2} className="mb-4" noPad>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800">
          {urgentChefQueueCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-900 dark:bg-red-950/60 dark:text-red-100">
              <span aria-hidden>🔴</span> {urgentChefQueueCount} urgence{urgentChefQueueCount > 1 ? "s" : ""} — votre validation
            </span>
          ) : null}
          {waitComptaQueueCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              <span aria-hidden>🟡</span> {waitComptaQueueCount} en attente compta
            </span>
          ) : null}
          {waitActivationQueueCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
              <span aria-hidden>🟡</span> {waitActivationQueueCount} poste{waitActivationQueueCount > 1 ? "s" : ""} à activer
            </span>
          ) : null}
          {queueEntirelyClear ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
              <span aria-hidden>🟢</span> Rien en attente
            </span>
          ) : null}
        </div>
        <p className="px-4 pt-2 pb-2 text-xs text-gray-500 dark:text-slate-400">
          Workflow guichet : statuts de session uniquement. Les montants affichés sont indicatifs (réservations du jour trajet liées au poste).
        </p>
        {canActivateShifts && pendingShifts.length > 0 && (
          <div className="px-4 pb-3">
            <h3 className="text-xs font-semibold text-gray-700 dark:text-slate-300 mb-2">Activation escale</h3>
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Priorité</th>
                    <th className={table.th}>Guichetier</th>
                    <th className={table.th}>Créé le</th>
                    <th className={table.th}>Action</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {pendingShifts.map((s) => (
                    <tr
                      key={s.id}
                      className={cn(tableRowClassName(), "border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20")}
                    >
                      <td className={table.td}>
                        <span className="text-lg" title="En attente">🟡</span>
                      </td>
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
          </div>
        )}
        {validatedByCompta.length === 0 &&
        closedPending.length === 0 &&
        (!canActivateShifts || pendingShifts.length === 0) ? (
          <div className="px-4 pb-4"><EmptyState message="Aucune session en file d&apos;attente." /></div>
        ) : (
          (closedPending.length > 0 || validatedByCompta.length > 0) && (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className={table.head}>
                  <tr>
                    <th className={table.th}>Priorité</th>
                    <th className={table.th}>Guichetier</th>
                    <th className={table.th}>Statut session</th>
                    <th className={table.th}>Début</th>
                    <th className={table.thRight}>Indicatif résa jour</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {sessionsQueueOrdered.map((s) => {
                    const rev = reservationsToday
                      .filter((r) => reservationMatchesGuichetShift(r, s))
                      .reduce((a, r) => a + (r.montant ?? 0), 0);
                    const isUrgentChef = s.status === "validated";
                    return (
                      <tr
                        key={s.id}
                        className={cn(
                          tableRowClassName(),
                          isUrgentChef && "border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/25",
                          s.status === "closed" && "border-l-4 border-l-amber-400 bg-amber-50/35 dark:bg-amber-950/20"
                        )}
                      >
                        <td className={table.td}>
                          <span className="text-lg" title={isUrgentChef ? "Critique — action chef" : "En attente compta"}>
                            {isUrgentChef ? "🔴" : "🟡"}
                          </span>
                        </td>
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
          )
        )}
      </SectionCard>
      )}

      {/* 5. Alertes */}
      {compactActivity ? (
        <details
          className={cn(
            "mb-4 overflow-hidden rounded-xl border shadow-sm",
            hasCriticalIssues
              ? "border-red-300 bg-red-50/40 dark:border-red-700 dark:bg-red-950/20"
              : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
          )}
          open={alertesOpenDefault}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              Alertes
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold tabular-nums text-gray-800 dark:bg-slate-800 dark:text-slate-200">
              {managerAlerts.length}
            </span>
          </summary>
          <div className="border-t border-gray-100 px-4 pb-4 pt-3 dark:border-gray-800">
            {managerAlerts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">Rien à traiter.</p>
            ) : (
              <ul className="space-y-2">
                {managerAlerts.map((a) => (
                  <li
                    key={a.id}
                    className={[
                      "rounded-lg border p-3 text-sm",
                      a.severity === "critical" && "border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30",
                      a.severity === "warning" && "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/20",
                      a.severity === "info" && "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div className="font-medium text-gray-900 dark:text-white">{a.title}</div>
                    <p className="mt-0.5 line-clamp-2 text-gray-600 dark:text-slate-400">{a.description}</p>
                    <button
                      type="button"
                      onClick={() => navigate(a.link)}
                      className="mt-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      Agir →
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ) : (
        <SectionCard title="Alertes" icon={AlertTriangle} className="mb-4">
          {managerAlerts.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Aucune alerte pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {managerAlerts.map((a) => (
                <li
                  key={a.id}
                  className={[
                    "rounded-lg border p-3 text-sm",
                    a.severity === "critical" && "border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/30",
                    a.severity === "warning" && "border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/20",
                    a.severity === "info" && "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/40",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="font-medium text-gray-900 dark:text-white">{a.title}</div>
                  <p className="mt-0.5 text-gray-600 dark:text-slate-400">{a.description}</p>
                  <button
                    type="button"
                    onClick={() => navigate(a.link)}
                    className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Ouvrir →
                  </button>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {/* 6. Activité en direct — billetterie & courrier (même granularité que la compta) */}
      <SectionCard
        title="Billetterie — postes ouverts"
        icon={Ticket}
        description={
          !embedded ? (
            <span className="text-xs text-gray-500 dark:text-slate-400">
              Réservations liées au <strong>shiftId</strong> du poste (périmètre différent des ventes « période » en tête de page).
            </span>
          ) : undefined
        }
        right={
          activeCounters.length > 0 ? (
            <StatusBadge status="neutral">
              {activeCounters.length} poste{activeCounters.length > 1 ? "s" : ""}
            </StatusBadge>
          ) : undefined
        }
        className="mb-4"
      >
        {activeCounters.length === 0 ? (
          <EmptyState message="Aucun guichet actif ou en pause." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCounters.map((c) => {
              const badgeStatus = shiftStatusToBadge[c.shift.status] ?? "neutral";
              return (
                <div
                  key={c.id}
                  className={COCKPIT_POST_CARD_3D}
                  style={cockpitPostCardTintStyle(cockpitTheme.primary, cockpitTheme.secondary)}
                >
                  <div
                    className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `linear-gradient(125deg, ${cockpitTheme.primary}22 0%, transparent 42%, ${cockpitTheme.secondary}18 100%)`,
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-slate-400">
                          Vendeur (billetterie)
                        </div>
                        <div className="font-semibold text-gray-900 dark:text-white truncate">
                          {c.displayName}{" "}
                          <span className="text-gray-500 text-sm ml-2 dark:text-slate-400">({c.code})</span>
                        </div>
                      </div>
                      <StatusBadge status={badgeStatus}>
                        {shiftStatusLabels[c.shift.status] ?? c.shift.status}
                      </StatusBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className={cn(typography.mutedSm, "mb-1")}>Réservations</div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{c.reservations}</div>
                      </div>
                      <div>
                        <div className={cn(typography.mutedSm, "mb-1")}>Billets</div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">{c.tickets}</div>
                      </div>
                      <div>
                        <div className={cn(typography.mutedSm, "mb-1")}>Début</div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmtSessionClock(c.shift.startTime)}
                        </div>
                      </div>
                      <div>
                        <div className={cn(typography.mutedSm, "mb-1")}>Fin</div>
                        <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                          {fmtSessionClock(c.shift.endTime)}
                        </div>
                      </div>
                    </div>
                    <div
                      className={COCKPIT_AMOUNT_PANEL_3D}
                      style={{ borderColor: `${cockpitTheme.primary}55` }}
                    >
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 dark:text-slate-400">
                        Montant total
                      </div>
                      <div
                        className="text-xl font-bold drop-shadow-sm"
                        style={{ color: cockpitTheme.primary }}
                      >
                        {money(c.revenue)}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                      onClick={() => {
                        toast.info("Action disponible dans Caisse");
                        navigate("/agence/caisse#caisse-sessions");
                      }}
                        className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      >
                      {ACTION_LABEL_VIEW_DETAILS}
                      </button>
                      <button
                        type="button"
                        onClick={() => openFlagIssue(c.id)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-200"
                      >
                        {ACTION_LABEL_FLAG_ISSUE}
                      </button>
                      {(c.status === "paused" || c.revenue < 0) ? (
                        <button
                          type="button"
                          onClick={() => {
                            setSuspendModalSessionId(c.id);
                            setSuspendReason("");
                          }}
                          className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/25 dark:text-red-200"
                        >
                          {ACTION_LABEL_SUSPEND_CRITICAL}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {hasCourierLiveSessions ? (
        <SectionCard
          title="Courrier — sessions en cours"
          icon={Package}
          description={
            compactActivity
              ? undefined
              : "Colis liés à chaque session (lecture seule ici — activation dans la compta agence)."
          }
          right={
            <StatusBadge status="neutral">
              {pendingCourierSessions.length + activeCourierSessions.length} session
              {pendingCourierSessions.length + activeCourierSessions.length > 1 ? "s" : ""}
            </StatusBadge>
          }
          className="mb-4"
        >
          <div className="space-y-8">
            {pendingCourierSessions.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0 opacity-70" />
                  Sessions en attente d&apos;activation
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {pendingCourierSessions.map((s) => {
                    const ui = courierStaffCache[s.agentId] || {};
                    const name = (ui.name && ui.name.trim()) || s.agentId;
                    const code = String(ui.code || s.agentCode || "").trim() || "—";
                    const stats = courierSessionStats[s.id] ?? { total: 0, paid: 0 };
                    const ledger = courierLedgerBySessionId[s.id];
                    const badgeStatus = courierStatusToBadge[s.status] ?? "neutral";
                    return (
                      <div
                        key={s.id}
                        className={COCKPIT_POST_CARD_3D}
                        style={cockpitPostCardTintStyle(cockpitTheme.primary, cockpitTheme.secondary)}
                      >
                        <div
                          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          style={{
                            background: `linear-gradient(125deg, ${cockpitTheme.primary}22 0%, transparent 42%, ${cockpitTheme.secondary}18 100%)`,
                          }}
                        />
                        <div className="relative">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-slate-400">
                                Agent (courrier)
                              </div>
                              <div className="font-semibold text-gray-900 dark:text-white truncate">
                                {name}{" "}
                                <span className="text-gray-500 text-sm ml-2 dark:text-slate-400">({code})</span>
                              </div>
                            </div>
                            <StatusBadge status={badgeStatus}>En attente</StatusBadge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Colis (session)</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {stats.total}
                              </div>
                            </div>
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Payés</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {stats.paid}
                              </div>
                            </div>
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Début</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {fmtSessionClock(s.createdAt)}
                              </div>
                            </div>
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Fin</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">—</div>
                            </div>
                          </div>
                          <div
                            className={COCKPIT_AMOUNT_PANEL_3D}
                            style={{ borderColor: `${cockpitTheme.primary}55` }}
                          >
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 dark:text-slate-400">
                              Montant total (ledger)
                            </div>
                            <div
                              className="text-xl font-bold drop-shadow-sm"
                              style={{ color: cockpitTheme.primary }}
                            >
                              {ledger === undefined ? "…" : money(ledger)}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                toast.info("Action disponible dans Caisse");
                                navigate("/agence/caisse#caisse-sessions");
                              }}
                              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {ACTION_LABEL_VIEW_DETAILS}
                            </button>
                            <button
                              type="button"
                              onClick={() => openFlagIssue(s.id)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-200"
                            >
                              {ACTION_LABEL_FLAG_ISSUE}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSuspendModalSessionId(s.id);
                                setSuspendReason("");
                              }}
                              className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/25 dark:text-red-200"
                            >
                              {ACTION_LABEL_SUSPEND_CRITICAL}
                            </button>
                            <Link
                              to="/agence/caisse#caisse-sessions"
                              onClick={() => toast.info("Action disponible dans Caisse")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-950/25 dark:text-indigo-200"
                            >
                              <Play className="w-4 h-4" />
                              Ouvrir Caisse
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {activeCourierSessions.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <Play className="w-4 h-4 shrink-0 opacity-70" />
                  Sessions en service
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeCourierSessions.map((s) => {
                    const ui = courierStaffCache[s.agentId] || {};
                    const name = (ui.name && ui.name.trim()) || s.agentId;
                    const code = String(ui.code || s.agentCode || "").trim() || "—";
                    const stats = courierSessionStats[s.id] ?? { total: 0, paid: 0 };
                    const ledger = courierLedgerBySessionId[s.id];
                    const badgeStatus = courierStatusToBadge[s.status] ?? "neutral";
                    return (
                      <div
                        key={s.id}
                        className={COCKPIT_POST_CARD_3D}
                        style={cockpitPostCardTintStyle(cockpitTheme.primary, cockpitTheme.secondary)}
                      >
                        <div
                          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                          style={{
                            background: `linear-gradient(125deg, ${cockpitTheme.primary}22 0%, transparent 42%, ${cockpitTheme.secondary}18 100%)`,
                          }}
                        />
                        <div className="relative">
                          <div className="flex items-start justify-between gap-3 mb-4">
                            <div className="min-w-0">
                              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-slate-400">
                                Agent (courrier)
                              </div>
                              <div className="font-semibold text-gray-900 dark:text-white truncate">
                                {name}{" "}
                                <span className="text-gray-500 text-sm ml-2 dark:text-slate-400">({code})</span>
                              </div>
                            </div>
                            <StatusBadge status={badgeStatus}>En service</StatusBadge>
                          </div>
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Colis (session)</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {stats.total}
                              </div>
                            </div>
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Payés</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {stats.paid}
                              </div>
                            </div>
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Début</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">
                                {fmtSessionClock(s.openedAt ?? s.createdAt)}
                              </div>
                            </div>
                            <div>
                              <div className={cn(typography.mutedSm, "mb-1")}>Fin</div>
                              <div className="font-medium text-gray-700 dark:text-gray-300 tabular-nums">—</div>
                            </div>
                          </div>
                          <div
                            className={COCKPIT_AMOUNT_PANEL_3D}
                            style={{ borderColor: `${cockpitTheme.primary}55` }}
                          >
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 dark:text-slate-400">
                              Montant total (ledger)
                            </div>
                            <div
                              className="text-xl font-bold drop-shadow-sm"
                              style={{ color: cockpitTheme.primary }}
                            >
                              {ledger === undefined ? "…" : money(ledger)}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                toast.info("Action disponible dans Caisse");
                                navigate("/agence/caisse#caisse-sessions");
                              }}
                              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                            >
                              {ACTION_LABEL_VIEW_DETAILS}
                            </button>
                            <button
                              type="button"
                              onClick={() => openFlagIssue(s.id)}
                              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-200"
                            >
                              {ACTION_LABEL_FLAG_ISSUE}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSuspendModalSessionId(s.id);
                                setSuspendReason("");
                              }}
                              className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-100 dark:border-red-700 dark:bg-red-950/25 dark:text-red-200"
                            >
                              {ACTION_LABEL_SUSPEND_CRITICAL}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {flagModalSessionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <h3 className="mb-2 text-base font-semibold text-gray-900 dark:text-white">Signaler une anomalie</h3>
            <p className="mb-3 text-xs text-gray-600 dark:text-slate-400">
              Niveau INTERVENTION : le signalement est journalisé localement et redirigé vers Caisse.
            </p>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[90px] dark:border-slate-600 dark:bg-slate-800"
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="Décrivez le problème constaté…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFlagModalSessionId(null)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submitFlagIssue}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/25 dark:text-amber-200"
              >
                Signaler
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {suspendModalSessionId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border-2 border-red-300 bg-red-50 p-5 shadow-xl dark:border-red-700 dark:bg-red-950/25">
            <h3 className="mb-2 text-base font-semibold text-red-900 dark:text-red-100">Action critique - Suspension</h3>
            <p className="mb-3 text-sm text-red-800 dark:text-red-200">
              This will block all operations for this session.
            </p>
            <label className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">Motif obligatoire</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm min-h-[96px] dark:border-red-700 dark:bg-slate-900 dark:text-slate-100"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Expliquez la raison de la suspension…"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendModalSessionId(null)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submitSuspendRequest}
                className="rounded-lg border border-red-400 bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700"
              >
                Continuer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );

  return embedded ? (
    <div className="space-y-4">{content}</div>
  ) : (
    <StandardLayoutWrapper>{content}</StandardLayoutWrapper>
  );
}
