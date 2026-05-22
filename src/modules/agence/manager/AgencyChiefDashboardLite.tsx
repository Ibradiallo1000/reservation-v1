import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, MetricCard, EmptyState, ActionButton, StatusBadge } from "@/ui";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Info,
  Package,
  Radio,
  Ticket,
} from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  getEndOfDayForDate,
  getStartOfDayForDate,
  getTodayForTimezone,
  resolveAgencyTimezone,
} from "@/shared/date/dateUtilsTz";
import { toast } from "sonner";
import {
  closeSession,
  continueSession,
  pauseSession,
} from "@/modules/agence/services/sessionService";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import ChiefSessionDetailModal from "@/modules/agence/manager/ChiefSessionDetailModal";
import AgencyBusMovementsSection from "@/modules/agence/manager/AgencyBusMovementsSection";
import {
  belongsToGuichetSession,
  reservationLinkedSessionId,
} from "@/modules/agence/guichet/guichetSessionReservationModel";

/** Durée au-delà de laquelle une session est considérée comme prolongée (supervision). */
const LONG_SESSION_THRESHOLD_MS = 8 * 60 * 60 * 1000;

export type SessionDoc = {
  id: string;
  kind: "guichet" | "courrier";
  type: string;
  status: string;
  /** Titulaire du poste (même règle que comptabilité agence pour rattacher les ventes). */
  userId?: string;
  closedAt?: unknown;
  endAt?: unknown;
  endTime?: unknown;
  validatedAt?: unknown;
  startAt?: unknown;
  openedAt?: unknown;
  createdAt?: unknown;
  userName?: string | null;
  userCode?: string | null;
  agentName?: string | null;
  agentCode?: string | null;
  totalReservations?: number;
  totalSales?: number;
  totalShipments?: number;
  totalRevenue?: number;
  totalAmount?: number;
  amount?: number;
};

type GuichetLiveTotals = {
  reservations: number;
  tickets: number;
  amount: number;
};

type CourierLiveTotals = {
  parcels: number;
  amount: number;
};

type OnlinePaymentsSummary = {
  reservations: number;
  amount: number;
};

type AgencyAlert = {
  title: string;
  detail: string;
  tone: "warning" | "danger";
};

type PeriodPreset = "realtime" | "today" | "yesterday" | "last7" | "month" | "custom";
type ActivityTypeFilter = "all" | "guichet" | "colis" | "online";

type PeriodRange = {
  startKey: string;
  endKey: string;
  start: Date;
  end: Date;
  label: string;
};

function toDateOrNull(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const maybe = v as { toDate?: () => Date; seconds?: number; nanoseconds?: number };
  if (typeof maybe.toDate === "function") {
    const d = maybe.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof maybe.seconds === "number") return new Date(maybe.seconds * 1000);
  return null;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStartKey(dateKey: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? `${dateKey.slice(0, 8)}01` : dateKey;
}

function normalizeRangeKeys(startKey: string, endKey: string): { startKey: string; endKey: string } {
  if (!startKey || !endKey) return { startKey, endKey };
  return startKey <= endKey ? { startKey, endKey } : { startKey: endKey, endKey: startKey };
}

function formatShortDateKeyFr(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
  }).format(d);
}

function periodLabel(startKey: string, endKey: string, fallback: string): string {
  if (startKey === endKey) return fallback;
  return `${formatShortDateKeyFr(startKey)} → ${formatShortDateKeyFr(endKey)}`;
}

function dateInRange(value: unknown, range: PeriodRange): boolean {
  const d = toDateOrNull(value);
  if (!d) return false;
  return d.getTime() >= range.start.getTime() && d.getTime() <= range.end.getTime();
}

function startAtOfSession(s: SessionDoc): Date | null {
  return toDateOrNull(s.startAt) ?? toDateOrNull(s.openedAt) ?? toDateOrNull(s.createdAt);
}

function isGuichetOperational(s: SessionDoc): boolean {
  const st = String(s.status ?? "").toLowerCase();
  return (st === "active" || st === "paused") && !toDateOrNull(s.closedAt);
}

function isCourierActive(s: SessionDoc): boolean {
  const st = String(s.status ?? "").toUpperCase();
  return st === "ACTIVE" && !toDateOrNull(s.closedAt);
}

function isGuichetFinalized(s: SessionDoc): boolean {
  const st = String(s.status ?? "").toLowerCase();
  return st === "closed" || st === "validated_agency" || st === "validated";
}

function isCourierFinalized(s: SessionDoc): boolean {
  const st = String(s.status ?? "").toUpperCase();
  return st === "CLOSED" || st === "VALIDATED_AGENCY" || st === "VALIDATED";
}

function sessionFinalizedAt(s: SessionDoc): unknown {
  return s.closedAt ?? s.endAt ?? s.endTime ?? s.validatedAt ?? s.createdAt;
}

function isOnlinePayment(data: Record<string, unknown>): boolean {
  const raw = data.channel ?? data.paymentChannel ?? data.canal;
  const channel = String(raw ?? "").toLowerCase();
  return channel === "online" || channel === "en_ligne" || channel === "web";
}

function isSessionProlonged(s: SessionDoc, now: Date): boolean {
  const start = startAtOfSession(s);
  if (!start) return false;
  return now.getTime() - start.getTime() > LONG_SESSION_THRESHOLD_MS;
}

function guichetStatusNorm(s: SessionDoc): "active" | "paused" | "other" {
  const st = String(s.status ?? "").toLowerCase();
  if (st === "active") return "active";
  if (st === "paused") return "paused";
  return "other";
}

function formatDateTimeFr(value: unknown): string {
  const d = toDateOrNull(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDurationFr(from: Date, to: Date): string {
  let ms = Math.max(0, to.getTime() - from.getTime());
  const h = Math.floor(ms / 3600000);
  ms -= h * 3600000;
  const m = Math.floor(ms / 60000);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

function formatClockFr(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(d);
}

function helpIcon(title: string): React.ReactNode {
  return (
    <span className="ml-1 inline-flex align-middle" title={title}>
      <Info className="h-3.5 w-3.5 text-slate-400" aria-hidden />
    </span>
  );
}

/** Même agrégation que l’affichage d’une carte session (live → champs session). */
function guichetTicketsDisplayed(s: SessionDoc, live?: GuichetLiveTotals): number {
  return Number(live?.tickets ?? s.totalSales ?? s.totalReservations ?? 0);
}

function guichetAmountDisplayed(s: SessionDoc, live?: GuichetLiveTotals): number {
  return Number(live?.amount ?? s.totalRevenue ?? s.amount ?? 0);
}

function courierParcelsDisplayed(s: SessionDoc, live?: CourierLiveTotals): number {
  return Number(live?.parcels ?? s.totalShipments ?? 0);
}

function courierAmountDisplayed(s: SessionDoc, live?: CourierLiveTotals): number {
  return Number(live?.amount ?? s.totalAmount ?? s.totalRevenue ?? s.amount ?? 0);
}

export default function AgencyChiefDashboardLite() {
  const { user } = useAuth() as {
    user?: {
      uid?: string;
      companyId?: string;
      agencyId?: string;
      agencyTimezone?: string;
      role?: string;
      displayName?: string | null;
      email?: string | null;
    };
  };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const money = useFormatCurrency();
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );
  const todayKey = useMemo(() => getTodayForTimezone(agencyTz), [agencyTz]);

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("realtime");
  const [customStartKey, setCustomStartKey] = useState(todayKey);
  const [customEndKey, setCustomEndKey] = useState(todayKey);
  const [activityTypeFilter, setActivityTypeFilter] = useState<ActivityTypeFilter>("all");
  const isRealtimeMode = periodPreset === "realtime";
  const selectedRange = useMemo<PeriodRange>(() => {
    let startKey = todayKey;
    let endKey = todayKey;
    let label = "Aujourd’hui";

    if (periodPreset === "yesterday") {
      startKey = addDaysToDateKey(todayKey, -1);
      endKey = startKey;
      label = "Hier";
    } else if (periodPreset === "last7") {
      startKey = addDaysToDateKey(todayKey, -6);
      endKey = todayKey;
      label = periodLabel(startKey, endKey, "7 derniers jours");
    } else if (periodPreset === "month") {
      startKey = monthStartKey(todayKey);
      endKey = todayKey;
      label = periodLabel(startKey, endKey, "Ce mois");
    } else if (periodPreset === "custom") {
      const normalized = normalizeRangeKeys(customStartKey || todayKey, customEndKey || todayKey);
      startKey = normalized.startKey;
      endKey = normalized.endKey;
      label = periodLabel(startKey, endKey, "Période personnalisée");
    } else if (periodPreset === "realtime") {
      label = "En direct";
    }

    return {
      startKey,
      endKey,
      start: getStartOfDayForDate(startKey, agencyTz),
      end: getEndOfDayForDate(endKey, agencyTz),
      label,
    };
  }, [periodPreset, todayKey, customStartKey, customEndKey, agencyTz]);

  useEffect(() => {
    setCustomStartKey(todayKey);
    setCustomEndKey(todayKey);
  }, [todayKey]);

  const periodOptions: Array<{ id: PeriodPreset; label: string }> = [
    { id: "realtime", label: "En direct" },
    { id: "today", label: "Aujourd’hui" },
    { id: "yesterday", label: "Hier" },
    { id: "last7", label: "7 derniers jours" },
    { id: "month", label: "Ce mois" },
    { id: "custom", label: "Personnalisé" },
  ];

  const setAnalysisPreset = (preset: PeriodPreset) => {
    setPeriodPreset(preset);
    if (preset === "custom") {
      setCustomStartKey((v) => v || todayKey);
      setCustomEndKey((v) => v || todayKey);
    }
  };

  const activityTypeOptions: Array<{ id: ActivityTypeFilter; label: string }> = [
    { id: "all", label: "Tout" },
    { id: "guichet", label: "Guichet" },
    { id: "colis", label: "Colis" },
    { id: "online", label: "En ligne" },
  ];

  const showAgencyActivity = activityTypeFilter !== "online";
  const showOnlineActivity = activityTypeFilter === "all" || activityTypeFilter === "online";
  const showGuichetActivity = activityTypeFilter === "all" || activityTypeFilter === "guichet";
  const showColisActivity = activityTypeFilter === "all" || activityTypeFilter === "colis";
  const periodBadgeLabel = isRealtimeMode ? "Vue : En direct" : "Vue : Historique";

  const [allGuichetSessions, setAllGuichetSessions] = useState<SessionDoc[]>([]);
  const [allCourierSessions, setAllCourierSessions] = useState<SessionDoc[]>([]);
  const [guichetSessions, setGuichetSessions] = useState<SessionDoc[]>([]);
  const [courierSessions, setCourierSessions] = useState<SessionDoc[]>([]);
  const [guichetLiveBySession, setGuichetLiveBySession] = useState<Record<string, GuichetLiveTotals>>({});
  const [courierLiveBySession, setCourierLiveBySession] = useState<Record<string, CourierLiveTotals>>({});
  const [onlineSummary, setOnlineSummary] = useState<OnlinePaymentsSummary>({ reservations: 0, amount: 0 });
  const [onlineLoadError, setOnlineLoadError] = useState(false);
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [detailSession, setDetailSession] = useState<SessionDoc | null>(null);

  const bumpLive = useCallback(() => {
    setLastLiveAt(new Date());
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const now = useMemo(() => new Date(), [tick, guichetSessions, courierSessions, lastLiveAt]);

  /** Uniquement sessions en service (exclut billetterie en pause). Courrier : déjà filtré actif à la source. */
  const openSessionsCount = useMemo(() => {
    const g = guichetSessions.filter((s) => guichetStatusNorm(s) === "active").length;
    const c = courierSessions.filter((s) => String(s.status ?? "").toUpperCase() === "ACTIVE").length;
    return g + c;
  }, [guichetSessions, courierSessions]);

  const activeGuichetSessions = useMemo(
    () => guichetSessions.filter((s) => guichetStatusNorm(s) === "active"),
    [guichetSessions]
  );

  const operationalSessions = useMemo(
    () => [...guichetSessions, ...courierSessions],
    [guichetSessions, courierSessions]
  );

  const prolongedCount = useMemo(
    () => operationalSessions.filter((s) => isSessionProlonged(s, now)).length,
    [operationalSessions, now]
  );

  /** KPI = somme des mêmes valeurs que les cartes « Sessions actives » (sessions + agrégations liées). */
  const kpiBilletsDepuisSessions = useMemo(
    () =>
      activeGuichetSessions.reduce(
        (acc, s) => acc + guichetTicketsDisplayed(s, guichetLiveBySession[s.id]),
        0
      ),
    [activeGuichetSessions, guichetLiveBySession]
  );

  const kpiColisDepuisSessions = useMemo(
    () =>
      courierSessions.reduce(
        (acc, s) => acc + courierParcelsDisplayed(s, courierLiveBySession[s.id]),
        0
      ),
    [courierSessions, courierLiveBySession]
  );

  const kpiMontantGuichetDepuisSessions = useMemo(
    () =>
      activeGuichetSessions.reduce(
        (acc, s) => acc + guichetAmountDisplayed(s, guichetLiveBySession[s.id]),
        0
      ),
    [activeGuichetSessions, guichetLiveBySession]
  );

  const kpiMontantColisDepuisSessions = useMemo(
    () =>
      courierSessions.reduce(
        (acc, s) => acc + courierAmountDisplayed(s, courierLiveBySession[s.id]),
        0
      ),
    [courierSessions, courierLiveBySession]
  );

  const kpiMontantIndicatifDepuisSessions = useMemo(
    () => kpiMontantGuichetDepuisSessions + kpiMontantColisDepuisSessions,
    [kpiMontantGuichetDepuisSessions, kpiMontantColisDepuisSessions]
  );

  const finalizedGuichetInRange = useMemo(
    () =>
      allGuichetSessions.filter(
        (s) => isGuichetFinalized(s) && dateInRange(sessionFinalizedAt(s), selectedRange)
      ),
    [allGuichetSessions, selectedRange]
  );

  const finalizedCourierInRange = useMemo(
    () =>
      allCourierSessions.filter(
        (s) => isCourierFinalized(s) && dateInRange(sessionFinalizedAt(s), selectedRange)
      ),
    [allCourierSessions, selectedRange]
  );

  const analysisBillets = useMemo(
    () => finalizedGuichetInRange.reduce((acc, s) => acc + guichetTicketsDisplayed(s), 0),
    [finalizedGuichetInRange]
  );

  const analysisColis = useMemo(
    () => finalizedCourierInRange.reduce((acc, s) => acc + courierParcelsDisplayed(s), 0),
    [finalizedCourierInRange]
  );

  const analysisMontant = useMemo(
    () =>
      finalizedGuichetInRange.reduce((acc, s) => acc + guichetAmountDisplayed(s), 0) +
      finalizedCourierInRange.reduce((acc, s) => acc + courierAmountDisplayed(s), 0),
    [finalizedGuichetInRange, finalizedCourierInRange]
  );

  const analysisMontantGuichet = useMemo(
    () => finalizedGuichetInRange.reduce((acc, s) => acc + guichetAmountDisplayed(s), 0),
    [finalizedGuichetInRange]
  );

  const analysisMontantColis = useMemo(
    () => finalizedCourierInRange.reduce((acc, s) => acc + courierAmountDisplayed(s), 0),
    [finalizedCourierInRange]
  );

  const displayedBillets = isRealtimeMode ? kpiBilletsDepuisSessions : analysisBillets;
  const displayedColis = isRealtimeMode ? kpiColisDepuisSessions : analysisColis;
  const displayedMontant = isRealtimeMode ? kpiMontantIndicatifDepuisSessions : analysisMontant;
  const displayedMontantGuichet = isRealtimeMode ? kpiMontantGuichetDepuisSessions : analysisMontantGuichet;
  const displayedMontantColis = isRealtimeMode ? kpiMontantColisDepuisSessions : analysisMontantColis;
  const displayedSessionCount = isRealtimeMode
    ? openSessionsCount
    : finalizedGuichetInRange.length + finalizedCourierInRange.length;
  const displayedGuichetSessionCount = isRealtimeMode ? activeGuichetSessions.length : finalizedGuichetInRange.length;
  const displayedColisSessionCount = isRealtimeMode ? courierSessions.length : finalizedCourierInRange.length;

  const closedGuichetPendingForView = useMemo(
    () =>
      allGuichetSessions.filter(
        (s) => String(s.status ?? "").toLowerCase() === "closed" && dateInRange(sessionFinalizedAt(s), selectedRange)
      ).length,
    [allGuichetSessions, selectedRange]
  );

  useEffect(() => {
    if (!companyId || !agencyId) {
      setAllGuichetSessions([]);
      setAllCourierSessions([]);
      setGuichetSessions([]);
      setCourierSessions([]);
      setLoadingInitial(false);
      return;
    }
    setLoadingInitial(true);
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        collection(db, "companies", companyId, "agences", agencyId, "shifts"),
        (snap) => {
          const all = snap.docs.map((d) => ({
              id: d.id,
              kind: "guichet" as const,
              type: "billetterie",
              ...(d.data() as Omit<SessionDoc, "id" | "kind" | "type">),
            }));
          setAllGuichetSessions(all);
          setGuichetSessions(all.filter((s) => isGuichetOperational(s)));
          bumpLive();
          setLoadingInitial(false);
        },
        () => {
          setAllGuichetSessions([]);
          setGuichetSessions([]);
          setLoadingInitial(false);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        courierSessionsRef(db, companyId, agencyId),
        (snap) => {
          const all = snap.docs.map((d) => ({
            id: d.id,
            kind: "courrier" as const,
            type: "courrier",
            ...(d.data() as Omit<SessionDoc, "id" | "kind" | "type">),
          }));
          setAllCourierSessions(all);
          setCourierSessions(all.filter((s) => isCourierActive(s)));
          bumpLive();
        },
        () => {
          setAllCourierSessions([]);
          setCourierSessions([]);
        }
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [companyId, agencyId, todayKey, agencyTz, bumpLive]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setGuichetLiveBySession({});
      return;
    }
    const sessionIds = guichetSessions.map((s) => s.id).filter(Boolean);
    if (sessionIds.length === 0) {
      setGuichetLiveBySession({});
      return;
    }

    const reservationsRef = collection(db, "companies", companyId, "agences", agencyId, "reservations");
    const unsubs: Array<() => void> = [];
    /** Même logique que la compta agence : `sessionId` / `shiftId` + vendeur du poste (pas `createdInSessionId`, absent des écritures guichet). */
    const chunkStates = new Map<
      number,
      {
        chunk: string[];
        sessionData: Map<string, Record<string, unknown>>;
        shiftData: Map<string, Record<string, unknown>>;
      }
    >();

    const shiftUserById: Record<string, string> = Object.fromEntries(
      guichetSessions.map((s) => [s.id, String(s.userId ?? "").trim()])
    );

    const recompute = () => {
      const merged: Record<string, GuichetLiveTotals> = {};
      for (const sid of sessionIds) {
        merged[sid] = { reservations: 0, tickets: 0, amount: 0 };
      }
      const seenDocIds = new Set<string>();
      for (const state of chunkStates.values()) {
        const byId = new Map<string, Record<string, unknown>>();
        for (const [id, data] of state.sessionData) byId.set(id, data);
        for (const [id, data] of state.shiftData) byId.set(id, data);

        for (const [docId, r] of byId) {
          if (seenDocIds.has(docId)) continue;
          const linked = reservationLinkedSessionId(r);
          if (!linked || !merged[linked]) continue;
          const uid = shiftUserById[linked] ?? "";
          if (!belongsToGuichetSession(r, linked, uid)) continue;
          seenDocIds.add(docId);
          merged[linked].reservations += 1;
          merged[linked].tickets += Math.max(0, Number(r.seatsGo ?? 0) + Number(r.seatsReturn ?? 0));
          merged[linked].amount += Math.max(0, Number(r.montant ?? 0));
        }
      }
      setGuichetLiveBySession(merged);
      bumpLive();
    };

    for (let i = 0; i < sessionIds.length; i += 10) {
      const chunk = sessionIds.slice(i, i + 10);
      const chunkIndex = i / 10;
      chunkStates.set(chunkIndex, {
        chunk,
        sessionData: new Map(),
        shiftData: new Map(),
      });

      const qSession = query(
        reservationsRef,
        where("sessionId", "in", chunk),
        where("canal", "==", "guichet"),
        limit(200)
      );
      unsubs.push(
        onSnapshot(
          qSession,
          (snap) => {
            const st = chunkStates.get(chunkIndex);
            if (!st) return;
            st.sessionData.clear();
            for (const d of snap.docs) st.sessionData.set(d.id, d.data() as Record<string, unknown>);
            recompute();
          },
          () => {
            const st = chunkStates.get(chunkIndex);
            if (st) st.sessionData.clear();
            recompute();
          }
        )
      );

      const qShift = query(
        reservationsRef,
        where("shiftId", "in", chunk),
        where("canal", "==", "guichet"),
        limit(200)
      );
      unsubs.push(
        onSnapshot(
          qShift,
          (snap) => {
            const st = chunkStates.get(chunkIndex);
            if (!st) return;
            st.shiftData.clear();
            for (const d of snap.docs) st.shiftData.set(d.id, d.data() as Record<string, unknown>);
            recompute();
          },
          () => {
            const st = chunkStates.get(chunkIndex);
            if (st) st.shiftData.clear();
            recompute();
          }
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [companyId, agencyId, guichetSessions, bumpLive]);

  useEffect(() => {
    if (!companyId) {
      setCourierLiveBySession({});
      return;
    }
    const sessionIds = courierSessions.map((s) => s.id).filter(Boolean);
    if (sessionIds.length === 0) {
      setCourierLiveBySession({});
      return;
    }

    const col = shipmentsRef(db, companyId);
    const unsubs: Array<() => void> = [];
    const chunkTotals = new Map<number, Record<string, CourierLiveTotals>>();

    const recompute = () => {
      const merged: Record<string, CourierLiveTotals> = {};
      for (const perChunk of chunkTotals.values()) {
        for (const [sid, t] of Object.entries(perChunk)) {
          if (!merged[sid]) merged[sid] = { parcels: 0, amount: 0 };
          merged[sid].parcels += t.parcels;
          merged[sid].amount += t.amount;
        }
      }
      setCourierLiveBySession(merged);
      bumpLive();
    };

    for (let i = 0; i < sessionIds.length; i += 10) {
      const chunk = sessionIds.slice(i, i + 10);
      const chunkIndex = i / 10;
      const q = query(col, where("sessionId", "in", chunk), limit(200));
      unsubs.push(
        onSnapshot(
          q,
          (snap) => {
            const perChunk: Record<string, CourierLiveTotals> = {};
            for (const d of snap.docs) {
              const row = d.data() as {
                sessionId?: string;
                transportFee?: number;
                insuranceAmount?: number;
              };
              const sid = String(row.sessionId ?? "");
              if (!sid || !chunk.includes(sid)) continue;
              if (!perChunk[sid]) perChunk[sid] = { parcels: 0, amount: 0 };
              perChunk[sid].parcels += 1;
              perChunk[sid].amount +=
                Math.max(0, Number(row.transportFee ?? 0)) + Math.max(0, Number(row.insuranceAmount ?? 0));
            }
            chunkTotals.set(chunkIndex, perChunk);
            recompute();
          },
          () => {
            chunkTotals.delete(chunkIndex);
            recompute();
          }
        )
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [companyId, courierSessions, bumpLive]);

  useEffect(() => {
    if (!companyId || !agencyId) {
      setOnlineSummary({ reservations: 0, amount: 0 });
      setOnlineLoadError(false);
      return;
    }

    const startTs = Timestamp.fromDate(selectedRange.start);
    const endTs = Timestamp.fromDate(selectedRange.end);
    const paymentsRef = collection(db, "companies", companyId, "payments");
    const q = query(
      paymentsRef,
      where("validatedAt", ">=", startTs),
      where("validatedAt", "<=", endTs),
      limit(500)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let reservations = 0;
        let amount = 0;
        for (const d of snap.docs) {
          const data = d.data() as Record<string, unknown>;
          if (String(data.agencyId ?? "") !== agencyId) continue;
          if (String(data.status ?? "") !== "validated") continue;
          if (!isOnlinePayment(data)) continue;
          const paidAt = data.validatedAt ?? data.createdAt;
          if (!dateInRange(paidAt, selectedRange)) continue;
          reservations += 1;
          amount += Math.max(0, Number(data.amount ?? data.montant ?? 0));
        }
        setOnlineSummary({ reservations, amount });
        setOnlineLoadError(false);
        bumpLive();
      },
      (err) => {
        console.warn("[AgencyChiefDashboardLite] online payments snapshot failed:", err);
        setOnlineSummary({ reservations: 0, amount: 0 });
        setOnlineLoadError(true);
      }
    );
    return () => unsub();
  }, [companyId, agencyId, selectedRange, bumpLive]);

  const agencyAlerts = useMemo<AgencyAlert[]>(() => {
    const alerts: AgencyAlert[] = [];
    const scopedSessions =
      activityTypeFilter === "guichet"
        ? guichetSessions
        : activityTypeFilter === "colis"
          ? courierSessions
          : operationalSessions;
    const scopedProlongedCount = scopedSessions.filter((s) => isSessionProlonged(s, now)).length;

    if (isRealtimeMode && showGuichetActivity && !loadingInitial && activeGuichetSessions.length === 0) {
      alerts.push({
        title: "Aucun guichet ouvert",
        detail: "Aucun poste guichet n'est actuellement en service.",
        tone: "warning",
      });
    }
    if (isRealtimeMode && scopedProlongedCount > 0) {
      alerts.push({
        title: "Session ouverte trop longtemps",
        detail: `${scopedProlongedCount} session${scopedProlongedCount > 1 ? "s" : ""} dépasse${scopedProlongedCount > 1 ? "nt" : ""} ${LONG_SESSION_THRESHOLD_MS / 3600000} h.`,
        tone: "danger",
      });
    }
    if (showGuichetActivity && closedGuichetPendingForView > 0) {
      alerts.push({
        title: "Activité sans validation",
        detail: `${closedGuichetPendingForView} session${closedGuichetPendingForView > 1 ? "s" : ""} clôturée${closedGuichetPendingForView > 1 ? "s" : ""} attend${closedGuichetPendingForView > 1 ? "ent" : ""} validation.`,
        tone: "warning",
      });
    }
    return alerts;
  }, [
    activityTypeFilter,
    activeGuichetSessions.length,
    closedGuichetPendingForView,
    courierSessions,
    guichetSessions,
    isRealtimeMode,
    loadingInitial,
    now,
    operationalSessions,
    showGuichetActivity,
  ]);

  const agencyStateOk = agencyAlerts.length === 0;

  const openSessionDetails = (s: SessionDoc) => setDetailSession(s);

  const suspendGuichet = async (session: SessionDoc) => {
    if (!companyId || !agencyId || !user?.uid) return;
    if (guichetStatusNorm(session) !== "active") return;
    const reasonRaw = window.prompt("Motif de la suspension (obligatoire) :");
    if (reasonRaw === null) return;
    const reason = String(reasonRaw).trim();
    if (!reason) {
      toast.error("Le motif de suspension est obligatoire.");
      return;
    }
    setSuspendingId(session.id);
    try {
      await pauseSession({
        companyId,
        agencyId,
        shiftId: session.id,
        pausedBy: {
          id: user.uid,
          name: user.displayName ?? user.email ?? null,
        },
        reason,
        actorRole: "chefAgence",
      });
      toast.success("Session billetterie mise en pause.");
    } catch (e) {
      console.error("[AgencyChiefDashboardLite] pauseSession:", e);
      toast.error(e instanceof Error ? e.message : "Impossible de suspendre.");
    } finally {
      setSuspendingId(null);
    }
  };

  const resumeGuichet = async (session: SessionDoc) => {
    if (!companyId || !agencyId || !user?.uid) return;
    if (guichetStatusNorm(session) !== "paused") return;
    setResumingId(session.id);
    try {
      await continueSession(companyId, agencyId, session.id);
      toast.success("Session billetterie reprise (en service).");
    } catch (e) {
      console.error("[AgencyChiefDashboardLite] continueSession:", e);
      toast.error(e instanceof Error ? e.message : "Impossible de reprendre.");
    } finally {
      setResumingId(null);
    }
  };

  const closeGuichetChief = async (session: SessionDoc) => {
    if (!companyId || !agencyId || !user?.uid) return;
    const st = guichetStatusNorm(session);
    if (st !== "active" && st !== "paused") {
      toast.error("Seules les sessions en service ou en pause peuvent être clôturées.");
      return;
    }
    if (
      !window.confirm(
        "Clôturer ce poste de billetterie ? Aucune nouvelle opération ne sera possible sur cette session."
      )
    )
      return;
    setClosingId(session.id);
    try {
      await closeSession({
        companyId,
        agencyId,
        shiftId: session.id,
        userId: user.uid,
        skipDeviceFingerprintCheck: true,
      });
      toast.success("Poste de billetterie clôturé.");
    } catch (e) {
      console.error("[AgencyChiefDashboardLite] closeSession:", e);
      toast.error(e instanceof Error ? e.message : "Clôture impossible.");
    } finally {
      setClosingId(null);
    }
  };

  if (!companyId || !agencyId) {
    return <EmptyState message="Contexte agence introuvable." />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Période : {selectedRange.label}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {periodBadgeLabel}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {periodOptions.map((option) => {
              const active = periodPreset === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setAnalysisPreset(option.id)}
                  className={[
                    "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-400 dark:bg-indigo-950/40 dark:text-indigo-100"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800 sm:flex-row sm:items-center">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            Type d’activité
          </span>
          <div className="flex flex-wrap gap-2">
            {activityTypeOptions.map((option) => {
              const active = activityTypeFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActivityTypeFilter(option.id)}
                  className={[
                    "rounded-lg border px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-400 dark:bg-emerald-950/40 dark:text-emerald-100"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800",
                  ].join(" ")}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        {periodPreset === "custom" ? (
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              Début
              <input
                type="date"
                value={customStartKey}
                onChange={(e) => setCustomStartKey(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-600 dark:text-gray-300">
              Fin
              <input
                type="date"
                value={customEndKey}
                onChange={(e) => setCustomEndKey(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </label>
          </div>
        ) : null}
      </div>

      {showAgencyActivity && isRealtimeMode ? (
        <SectionCard
          title="État actuel de l’agence"
          icon={agencyStateOk ? CheckCircle2 : AlertTriangle}
          right={
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {lastLiveAt ? formatClockFr(lastLiveAt) : "En attente"}
            </span>
          }
        >
          <div
            className={[
              "rounded-lg border px-4 py-3",
              agencyStateOk
                ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100"
                : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
            ].join(" ")}
          >
            <p className="text-lg font-semibold">
              {agencyStateOk ? "Tout fonctionne normalement" : agencyAlerts[0]?.title}
            </p>
            {!agencyStateOk ? (
              <p className="mt-1 text-sm">{agencyAlerts[0]?.detail}</p>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {showAgencyActivity ? (
        <SectionCard
          title="Activité agence"
          icon={Activity}
          right={
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Caisse agence uniquement
            </span>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label={
                activityTypeFilter === "guichet"
                  ? "Sessions guichet"
                  : activityTypeFilter === "colis"
                    ? "Sessions colis"
                    : "Sessions"
              }
              icon={Clock}
              help={helpIcon(
                isRealtimeMode ? "Sessions actives uniquement." : "Sessions clôturées dans la période."
              )}
              value={
                loadingInitial
                  ? "—"
                  : activityTypeFilter === "guichet"
                    ? displayedGuichetSessionCount
                    : activityTypeFilter === "colis"
                      ? displayedColisSessionCount
                      : displayedSessionCount
              }
            />
            {showGuichetActivity ? (
              <MetricCard
                label="Billets guichet"
                icon={Ticket}
                help={helpIcon("Réservations guichet rattachées aux sessions agence.")}
                value={loadingInitial ? "—" : displayedBillets}
              />
            ) : null}
            {showColisActivity ? (
              <MetricCard
                label="Colis enregistrés"
                icon={Package}
                help={helpIcon("Colis rattachés aux sessions courrier agence.")}
                value={loadingInitial ? "—" : displayedColis}
              />
            ) : null}
            <MetricCard
              label={
                activityTypeFilter === "guichet"
                  ? "Caisse guichet"
                  : activityTypeFilter === "colis"
                    ? "Caisse colis"
                    : "Caisse agence"
              }
              icon={DollarSign}
              help={helpIcon("Argent terrain uniquement. Les ventes en ligne sont exclues.")}
              value={
                loadingInitial
                  ? "—"
                  : money(
                      activityTypeFilter === "guichet"
                        ? displayedMontantGuichet
                        : activityTypeFilter === "colis"
                          ? displayedMontantColis
                          : displayedMontant
                    )
              }
            />
          </div>
        </SectionCard>
      ) : null}

      {showOnlineActivity ? (
        <SectionCard
          title="Ventes en ligne"
          icon={Ticket}
          right={
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/40 dark:text-blue-100">
              Argent déjà encaissé (siège)
            </span>
          }
        >
          {onlineLoadError ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Paiements en ligne indisponibles.
            </p>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MetricCard
              label="Total ventes online"
              icon={DollarSign}
              help={helpIcon("Hors caisse agence. Argent encaissé au niveau compagnie.")}
              value={money(onlineSummary.amount)}
            />
            <MetricCard
              label="Réservations"
              icon={Ticket}
              help={helpIcon("Paiements en ligne validés sur la période affichée.")}
              value={onlineSummary.reservations}
            />
          </div>
        </SectionCard>
      ) : null}

      <AgencyBusMovementsSection
        companyId={companyId}
        agencyId={agencyId}
        todayKey={todayKey}
        agencyTz={agencyTz}
        mode={isRealtimeMode ? "realtime" : "analysis"}
        rangeStartKey={selectedRange.startKey}
        rangeEndKey={selectedRange.endKey}
      />

      <SectionCard title="Alertes" icon={AlertTriangle}>
        {agencyAlerts.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
            Aucune alerte.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {agencyAlerts.map((alert) => (
              <div
                key={alert.title}
                className={[
                  "rounded-lg border px-4 py-3",
                  alert.tone === "danger"
                    ? "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-100"
                    : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100",
                ].join(" ")}
              >
                <p className="font-semibold">{alert.title}</p>
                <p className="mt-1 text-sm">{alert.detail}</p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Suivi des guichets" icon={Radio}>
        {guichetSessions.length === 0 ? (
          <EmptyState message="Aucun guichet ouvert." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {guichetSessions.map((s) => {
              const prolonged = isSessionProlonged(s, now);
              const start = startAtOfSession(s);
              const agentName = String(s.userName ?? s.agentName ?? "Agent");
              const agentCode = String(s.userCode ?? s.agentCode ?? "").trim();
              const guichetLive = guichetLiveBySession[s.id];
              const opCount = guichetTicketsDisplayed(s, guichetLive);
              const indicatifMontant = guichetAmountDisplayed(s, guichetLive);
              const guStatus = guichetStatusNorm(s);
              const sessionStateLabel = guStatus === "active" ? "Actif" : "Inactif";
              const busy = suspendingId === s.id || resumingId === s.id || closingId === s.id;

              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {agentCode ? `${agentName} (${agentCode})` : agentName}
                    </div>
                    {prolonged ? (
                      <StatusBadge status="warning">Trop longue</StatusBadge>
                    ) : guStatus === "active" ? (
                      <StatusBadge status="success">{sessionStateLabel}</StatusBadge>
                    ) : (
                      <StatusBadge status="warning">{sessionStateLabel}</StatusBadge>
                    )}
                  </div>
                  <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                    <p>
                      Début : <strong>{formatDateTimeFr(s.startAt ?? s.openedAt ?? s.createdAt)}</strong>
                    </p>
                    <p>
                      Durée : <strong>{start ? formatDurationFr(start, now) : "—"}</strong>
                    </p>
                    <p>
                      Ventes : <strong>{opCount}</strong>
                    </p>
                    <p>
                      Montant : <strong>{money(indicatifMontant)}</strong>
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      type="button"
                      variant="secondary"
                      onClick={() => openSessionDetails(s)}
                    >
                      Voir détails
                    </ActionButton>
                    {guStatus === "active" ? (
                      <ActionButton
                        type="button"
                        variant="secondary"
                        disabled={busy || !user?.uid}
                        onClick={() => void suspendGuichet(s)}
                      >
                        {suspendingId === s.id ? "Suspension…" : "Suspendre"}
                      </ActionButton>
                    ) : null}
                    {guStatus === "paused" ? (
                      <ActionButton
                        type="button"
                        variant="secondary"
                        disabled={busy || !user?.uid}
                        onClick={() => void resumeGuichet(s)}
                      >
                        {resumingId === s.id ? "Reprise…" : "Reprendre"}
                      </ActionButton>
                    ) : null}
                    <ActionButton
                      type="button"
                      variant="danger"
                      disabled={
                        busy ||
                        !user?.uid ||
                        (guStatus !== "active" && guStatus !== "paused")
                      }
                      onClick={() => void closeGuichetChief(s)}
                    >
                      {closingId === s.id ? "Clôture…" : "Clôturer"}
                    </ActionButton>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <ChiefSessionDetailModal
        open={detailSession != null}
        session={detailSession}
        companyId={companyId}
        agencyId={agencyId}
        onClose={() => setDetailSession(null)}
      />
    </div>
  );
}
