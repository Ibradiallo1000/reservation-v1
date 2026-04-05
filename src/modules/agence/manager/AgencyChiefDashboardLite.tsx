import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, MetricCard, EmptyState, ActionButton, StatusBadge } from "@/ui";
import {
  Activity,
  Clock,
  DollarSign,
  Info,
  Package,
  Radio,
  Ticket,
} from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getTodayForTimezone, resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";
import { toast } from "sonner";
import {
  closeSession,
  continueSession,
  pauseSession,
} from "@/modules/agence/services/sessionService";
import { closeCourierSession } from "@/modules/logistics/services/courierSessionService";
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

function formatDateFr(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

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
  return Number(live?.amount ?? s.totalRevenue ?? s.amount ?? 0);
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
  const todayLabel = useMemo(() => formatDateFr(todayKey), [todayKey]);

  const [guichetSessions, setGuichetSessions] = useState<SessionDoc[]>([]);
  const [courierSessions, setCourierSessions] = useState<SessionDoc[]>([]);
  const [guichetLiveBySession, setGuichetLiveBySession] = useState<Record<string, GuichetLiveTotals>>({});
  const [courierLiveBySession, setCourierLiveBySession] = useState<Record<string, CourierLiveTotals>>({});
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

  const billetterieActivesCount = useMemo(
    () => guichetSessions.filter((s) => guichetStatusNorm(s) === "active").length,
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
      guichetSessions.reduce(
        (acc, s) => acc + guichetTicketsDisplayed(s, guichetLiveBySession[s.id]),
        0
      ),
    [guichetSessions, guichetLiveBySession]
  );

  const kpiColisDepuisSessions = useMemo(
    () =>
      courierSessions.reduce(
        (acc, s) => acc + courierParcelsDisplayed(s, courierLiveBySession[s.id]),
        0
      ),
    [courierSessions, courierLiveBySession]
  );

  const kpiMontantIndicatifDepuisSessions = useMemo(
    () =>
      guichetSessions.reduce(
        (acc, s) => acc + guichetAmountDisplayed(s, guichetLiveBySession[s.id]),
        0
      ) +
      courierSessions.reduce(
        (acc, s) => acc + courierAmountDisplayed(s, courierLiveBySession[s.id]),
        0
      ),
    [guichetSessions, courierSessions, guichetLiveBySession, courierLiveBySession]
  );

  useEffect(() => {
    if (!companyId || !agencyId) {
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
          const rows = snap.docs
            .map((d) => ({
              id: d.id,
              kind: "guichet" as const,
              type: "billetterie",
              ...(d.data() as Omit<SessionDoc, "id" | "kind" | "type">),
            }))
            .filter((s) => isGuichetOperational(s));
          setGuichetSessions(rows);
          bumpLive();
          setLoadingInitial(false);
        },
        () => {
          setGuichetSessions([]);
          setLoadingInitial(false);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        courierSessionsRef(db, companyId, agencyId),
        (snap) => {
          const rows = snap.docs
            .map((d) => ({
              id: d.id,
              kind: "courrier" as const,
              type: "courrier",
              ...(d.data() as Omit<SessionDoc, "id" | "kind" | "type">),
            }))
            .filter((s) => isCourierActive(s));
          setCourierSessions(rows);
          bumpLive();
        },
        () => setCourierSessions([])
      )
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [companyId, agencyId, bumpLive]);

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
        limit(1000)
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
        limit(1000)
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
      const q = query(col, where("sessionId", "in", chunk), limit(500));
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

  const closeCourierChief = async (session: SessionDoc) => {
    if (!companyId || !agencyId) return;
    if (!window.confirm("Clôturer cette session courrier ?")) return;
    setClosingId(session.id);
    try {
      await closeCourierSession({ companyId, agencyId, sessionId: session.id });
      toast.success("Session courrier clôturée.");
    } catch (e) {
      console.error("[AgencyChiefDashboardLite] closeCourierSession:", e);
      toast.error(e instanceof Error ? e.message : "Clôture impossible.");
    } finally {
      setClosingId(null);
    }
  };

  if (!companyId || !agencyId) {
    return <EmptyState message="Contexte agence introuvable." />;
  }

  const helpMontantIndicatif = (
    <span className="ml-1 inline-flex align-middle" title="Montant non validé en caisse">
      <Info className="h-3.5 w-3.5 text-slate-400" aria-hidden />
    </span>
  );

  return (
    <div className="space-y-4">
      <SectionCard
        title="Résumé opérationnel"
        description={`Indicateurs alignés sur les sessions affichées ci-dessous (${todayLabel}). Hors validation comptable.`}
        icon={Activity}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Sessions ouvertes"
            icon={Radio}
            value={loadingInitial ? "—" : openSessionsCount}
            hint="Postes billetterie en service et sessions courrier actives (état : actif)."
          />
          <MetricCard
            label="Billets vendus"
            icon={Ticket}
            value={loadingInitial ? "—" : kpiBilletsDepuisSessions}
            hint="Somme des places vendues sur toutes les sessions billetterie (service ou pause), même total que les cartes."
          />
          <MetricCard
            label="Colis enregistrés"
            icon={Package}
            value={loadingInitial ? "—" : kpiColisDepuisSessions}
            hint="Somme des colis sur toutes les sessions courrier actives, même total que les cartes."
          />
          <MetricCard
            label="Montant des ventes (indicatif)"
            icon={DollarSign}
            help={helpMontantIndicatif}
            value={loadingInitial ? "—" : money(kpiMontantIndicatifDepuisSessions)}
            hint="Billetterie + courrier, même calcul que chaque session — indicatif, non validé en caisse."
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Activité en direct"
        description="Aperçu des postes ouverts : billetterie et courrier."
        icon={Clock}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            Postes billetterie en service : <strong>{billetterieActivesCount}</strong>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            Sessions courrier en service : <strong>{courierSessions.length}</strong>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            Sessions prolongées (&gt; {LONG_SESSION_THRESHOLD_MS / 3600000} h) :{" "}
            <strong>{prolongedCount}</strong>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            Dernière mise à jour :{" "}
            <strong>{lastLiveAt ? formatClockFr(lastLiveAt) : "—"}</strong>
          </div>
        </div>
      </SectionCard>

      <AgencyBusMovementsSection
        companyId={companyId}
        agencyId={agencyId}
        todayKey={todayKey}
        agencyTz={agencyTz}
      />

      <SectionCard
        title="Sessions actives"
        description="Billetterie (service ou pause) et courrier (en service). Synthèse issue des dossiers de session."
        icon={Activity}
      >
        {operationalSessions.length === 0 ? (
          <EmptyState message="Aucune session à afficher." />
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {operationalSessions.map((s) => {
              const prolonged = isSessionProlonged(s, now);
              const start = startAtOfSession(s);
              const agentName = String(s.userName ?? s.agentName ?? "Agent");
              const agentCode = String(s.userCode ?? s.agentCode ?? "").trim();
              const isCourrier = s.kind === "courrier";
              const guichetLive = guichetLiveBySession[s.id];
              const courierLive = courierLiveBySession[s.id];
              const opCount = isCourrier
                ? courierParcelsDisplayed(s, courierLive)
                : guichetTicketsDisplayed(s, guichetLive);
              const indicatifMontant = isCourrier
                ? courierAmountDisplayed(s, courierLive)
                : guichetAmountDisplayed(s, guichetLive);

              const guStatus = guichetStatusNorm(s);
              const sessionStateLabel = isCourrier
                ? "En service"
                : guStatus === "active"
                  ? "En service"
                  : guStatus === "paused"
                    ? "En pause"
                    : String(s.status ?? "—");

              const busy =
                suspendingId === s.id || resumingId === s.id || closingId === s.id;

              return (
                <div
                  key={`${s.kind}-${s.id}`}
                  className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {isCourrier ? "Courrier" : "Billetterie"}
                    </div>
                    {prolonged ? (
                      <StatusBadge status="warning">Durée prolongée</StatusBadge>
                    ) : (
                      <StatusBadge status="success">Durée dans la norme</StatusBadge>
                    )}
                  </div>
                  <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                    <p>
                      Agent : <strong>{agentCode ? `${agentName} (${agentCode})` : agentName}</strong>
                    </p>
                    <p>
                      Début :{" "}
                      <strong>{formatDateTimeFr(s.startAt ?? s.openedAt ?? s.createdAt)}</strong>
                    </p>
                    <p>
                      Durée :{" "}
                      <strong>
                        {start ? formatDurationFr(start, now) : "—"}
                      </strong>
                    </p>
                    <p>
                      {isCourrier ? "Colis enregistrés (session)" : "Billets vendus (places)"} :{" "}
                      <strong>{opCount}</strong>
                    </p>
                    <p>
                      Montant des ventes (indicatif) :{" "}
                      <strong>{money(indicatifMontant)}</strong>
                    </p>
                    <p>
                      État session : <strong>{sessionStateLabel}</strong>
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
                    {!isCourrier && guStatus === "active" ? (
                      <ActionButton
                        type="button"
                        variant="secondary"
                        disabled={busy || !user?.uid}
                        onClick={() => void suspendGuichet(s)}
                      >
                        {suspendingId === s.id ? "Suspension…" : "Suspendre"}
                      </ActionButton>
                    ) : null}
                    {!isCourrier && guStatus === "paused" ? (
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
                        (!isCourrier &&
                          guStatus !== "active" &&
                          guStatus !== "paused")
                      }
                      onClick={() =>
                        void (isCourrier ? closeCourierChief(s) : closeGuichetChief(s))
                      }
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
