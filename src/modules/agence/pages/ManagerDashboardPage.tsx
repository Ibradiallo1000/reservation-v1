// src/modules/agence/pages/ManagerDashboardPage.tsx
// Phase 4 + 4.5: Manager Command Center — uses dailyStats + agencyLiveState to reduce listeners.
import React, { useEffect, useState, useMemo } from "react";
import { collection, doc, query, where, onSnapshot, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getAgencyLedgerPaymentReceivedTotalForPeriod } from "@/modules/agence/comptabilite/agencyCashAuditService";
import {
  getEndOfDay,
  getStartOfDay,
  getTodayForTimezone,
  resolveAgencyTimezone,
} from "@/shared/date/dateUtilsTz";
import { AGENCY_KPI_TIME } from "@/modules/agence/shared/agencyKpiTimeContract";
import { formatDateLongFr } from "@/utils/dateFmt";
import type { AgencyLiveStateDoc, DailyStatsDoc } from "../aggregates/types";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, EmptyState, table, tableRowClassName } from "@/ui";
import { LayoutDashboard } from "lucide-react";

const SESSION_DURATION_WARNING_HOURS = 8;

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

const ManagerDashboardPage: React.FC = () => {
  const { user } = useAuth() as {
    user: { companyId?: string; agencyId?: string; agencyTimezone?: string };
  };
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? null;
  const agencyId = user?.agencyId ?? null;
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );

  const [dailyStats, setDailyStats] = useState<DailyStatsDoc | null>(null);
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [reservationsToday, setReservationsToday] = useState<ReservationDoc[]>([]);
  const [agencyLiveState, setAgencyLiveState] = useState<AgencyLiveStateDoc | null>(null);
  const [loading, setLoading] = useState(true);
  /** FINANCIAL_TRUTH (ledger) : encaissements jour Bamako. */
  const [ledgerEncaissementsToday, setLedgerEncaissementsToday] = useState<number | null>(null);

  const today = useMemo(() => getTodayForTimezone(agencyTz), [agencyTz]);
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

    setLoading(false);
    return () => {
      unsubDailyStats();
      unsubLiveState();
      unsubShifts();
      unsubRes();
    };
  }, [companyId, agencyId, today]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const dayStart = getStartOfDay(agencyTz);
    const dayEndExclusive = new Date(getEndOfDay(agencyTz).getTime() + 1);
    getAgencyLedgerPaymentReceivedTotalForPeriod(companyId, agencyId, dayStart, dayEndExclusive)
      .then((r) => setLedgerEncaissementsToday(r.total))
      .catch(() => setLedgerEncaissementsToday(null));
  }, [companyId, agencyId, agencyTz]);

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
      const sid = String((r as { sessionId?: string; shiftId?: string }).sessionId ?? (r as { shiftId?: string }).shiftId ?? "");
      if (sid && r.montant != null) {
        map[sid] = (map[sid] ?? 0) + r.montant;
      }
    });
    return map;
  }, [reservationsToday]);

  /** T₄ : réservations dont la date de voyage = jour calendaire agence (Bamako), terrain uniquement. */
  const totalRevenueToday = useMemo(
    () => reservationsToday.reduce((acc, r) => acc + (r.montant ?? 0), 0),
    [reservationsToday]
  );
  const totalPassengersToday = useMemo(
    () => reservationsToday.reduce((acc, r) => acc + (r.seatsGo ?? 1), 0),
    [reservationsToday]
  );

  const alerts = useMemo(() => {
    const list: Array<{ type: string; message: string }> = [];
    closedShifts.forEach((s) => {
      list.push({ type: "session", message: `Session clôturée non validée : ${s.userName ?? s.id}` });
    });
    return list;
  }, [closedShifts]);

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
        <p className="text-xs text-gray-500 mb-3">{AGENCY_KPI_TIME.SESSION_POSTE}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <MetricCard
            label="Actives"
            value={activeShiftsCount}
            valueColorVar="#059669"
            hint={AGENCY_KPI_TIME.SESSION_POSTE}
          />
          <MetricCard
            label="Clôturées (en attente validation)"
            value={closedPendingCount}
            valueColorVar="#d97706"
            hint={AGENCY_KPI_TIME.SESSION_POSTE}
          />
          <MetricCard
            label="Validées"
            value={validatedShiftsCount}
            valueColorVar="#475569"
            hint={AGENCY_KPI_TIME.SESSION_POSTE}
          />
        </div>
        <div className={table.wrapper}>
          <table className={table.base}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Guichetier</th>
                <th className={table.th}>Statut</th>
                <th className={table.thRight}>Revenu (terrain, date voyage)</th>
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
        <div className="space-y-6">
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200 mb-3">
              Bloc transport — ne pas comparer au ledger
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="CA réservations (jour)"
                value={totalRevenueToday.toFixed(0)}
                valueColorVar="#4f46e5"
                hint={AGENCY_KPI_TIME.DATE_VOYAGE}
              />
              <MetricCard
                label="Passagers"
                value={totalPassengersToday}
                valueColorVar="#7c3aed"
                hint={AGENCY_KPI_TIME.DATE_VOYAGE}
              />
              <MetricCard
                label="Taux de remplissage"
                value="—"
                valueColorVar="#0d9488"
                hint="Capacité par bus : planification / embarquement (hors tableau manager)."
              />
              <MetricCard
                label="Meilleur guichetier (revenu terrain)"
                value={topCashier?.userName ?? "—"}
                valueColorVar="#d97706"
                hint={AGENCY_KPI_TIME.DATE_VOYAGE}
              />
            </div>
          </div>
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 mb-3">
              Bloc comptabilité — séparé du transport et des sessions
            </p>
            <MetricCard
              label="Encaissements ledger (jour)"
              value={ledgerEncaissementsToday != null ? money(ledgerEncaissementsToday) : "—"}
              valueColorVar="#059669"
              hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
            />
          </div>
        </div>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default ManagerDashboardPage;
