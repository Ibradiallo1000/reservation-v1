import React, { useCallback, useEffect, useState, useMemo } from "react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  collection, query, where, onSnapshot, limit, orderBy,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { getLedgerBalances } from "@/modules/compagnie/treasury/financialTransactions";
import { listExpenses, PENDING_STATUSES } from "@/modules/compagnie/treasury/expenses";
import { chefExceptionalValidation } from "@/modules/agence/services/chefExceptionalValidation";
import { validateSessionByHeadAccountant } from "@/modules/agence/services/sessionService";
import { validateCourierSessionByHeadAccountant } from "@/modules/logistics/services/courierSessionService";
import { listChefIncidents } from "@/modules/agence/manager/incidentStore";
import {
  Banknote, Wallet, TrendingDown, ArrowRightLeft,
  CheckCircle2, Loader2, Ticket, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { refundPayment } from "@/modules/compagnie/treasury/ledgerRefundService";
import { isConfirmedTransactionStatus } from "@/modules/compagnie/treasury/financialTransactions";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table, tableRowClassName, typography,
} from "@/ui";
import { useDateFilterContext } from "./DateFilterContext";
import { getUnifiedAgencyFinance } from "@/modules/finance/services/unifiedFinanceService";
import { reportMixedFinancialSourceUsage } from "@/modules/compagnie/treasury/financialSourceGuard";
import {
  getAgencyCashPosition,
  getAgencyLedgerPaymentReceivedTotalForPeriod,
} from "@/modules/agence/comptabilite/agencyCashAuditService";
import { getEndOfDay, getStartOfDay, resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";
import { AGENCY_KPI_TIME } from "@/modules/agence/shared/agencyKpiTimeContract";
import { cn } from "@/lib/utils";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { getCourierSessionLedgerTotal } from "@/modules/logistics/services/courierSessionLedger";

dayjs.extend(utc);
dayjs.extend(timezone);
type ShiftDoc = {
  id: string; status: string; userId: string; userName?: string | null;
  startTime?: any; endTime?: any;
  comptable?: { validated?: boolean; at?: any };
  lockedComptable?: boolean; lockedChef?: boolean;
  exceptionalValidation?: { requested?: boolean; at?: any; by?: { name?: string } };
};
type ShiftReportDoc = {
  id: string;
  billets?: number;
  montant?: number;
  details?: Array<{ trajet?: string; billets?: number; montant?: number }>;
};
type CourierSessionLite = {
  id: string;
  status?: string;
  agentCode?: string;
  validatedAmount?: number;
  openedAt?: { toDate?: () => Date } | Date | null;
  closedAt?: { toDate?: () => Date } | Date | null;
};

export type ManagerFinancesPageProps = {
  embedded?: boolean;
  /** Domaine Caisse : notifie un rafraîchissement de l’onglet Trésorerie (et écouteurs globaux). */
  onAgencyFinancialUpdate?: () => void;
};

export default function ManagerFinancesPage({
  embedded = false,
  onAgencyFinancialUpdate,
}: ManagerFinancesPageProps = {}) {
  const { user, company } = useAuth() as any;
  const money = useFormatCurrency();
  reportMixedFinancialSourceUsage("ManagerFinancesPage", true, false);
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: user?.agencyTimezone }),
    [user?.agencyTimezone]
  );

  const dateFilter = useDateFilterContext();

  const [revenue, setRevenue] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [cashPosition, setCashPosition] = useState(0);
  const [expenses, setExpenses] = useState(0);
  /** FINANCIAL_TRUTH (ledger) : payment_received confirmés, jour Bamako. */
  const [todayLedgerEncaissements, setTodayLedgerEncaissements] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);
  /** FINANCIAL_TRUTH : solde caisse espèces reconstitué depuis financialTransactions (peut être plafonné). */
  const [ledgerCashFromTransactions, setLedgerCashFromTransactions] = useState<{
    soldeCash: number;
    capped: boolean;
  } | null>(null);
  const [ledgerRows, setLedgerRows] = useState<
    Array<{
      id: string;
      amount: number;
      type?: string;
      referenceType?: string;
      performedAt?: unknown;
      paymentMethod?: string;
      status?: string;
    }>
  >([]);
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [courierSessions, setCourierSessions] = useState<CourierSessionLite[]>([]);
  const [courierExpectedBySessionId, setCourierExpectedBySessionId] = useState<Record<string, number>>({});
  const [shiftReportsById, setShiftReportsById] = useState<Record<string, ShiftReportDoc>>({});
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [busyCourierSessionId, setBusyCourierSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [refundTargetId, setRefundTargetId] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [exceptionTargetId, setExceptionTargetId] = useState<string | null>(null);
  const [exceptionReason, setExceptionReason] = useState("");
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false);
  const [openIncidents, setOpenIncidents] = useState<
    Array<{ id: string; severity: string; reason: string; relatedSessionId: string; createdAtIso: string }>
  >([]);
  /** Incrémenté après validation chef / remboursement pour relire KPI période + jour. */
  const [financeKpiRefreshKey, setFinanceKpiRefreshKey] = useState(0);

  const refreshLedgerBalancesOnly = useCallback(async () => {
    if (!companyId || !agencyId) return;
    const currency = (company as any)?.devise ?? "XOF";
    try {
      await ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom);
    } catch {
      // comptes par défaut optionnels pour la lecture des soldes
    }
    const [balRes, posRes] = await Promise.allSettled([
      getLedgerBalances(companyId, agencyId),
      getAgencyCashPosition(companyId, agencyId),
    ]);
    if (balRes.status === "fulfilled") setCashPosition(balRes.value.cash);
    if (posRes.status === "fulfilled") {
      setLedgerCashFromTransactions({
        soldeCash: posRes.value.soldeCash,
        capped: posRes.value.capped,
      });
    } else {
      setLedgerCashFromTransactions(null);
    }
  }, [companyId, agencyId, company]);

  const notifyAgencyFinancialChange = useCallback(() => {
    void refreshLedgerBalancesOnly();
    setFinanceKpiRefreshKey((k) => k + 1);
    onAgencyFinancialUpdate?.();
  }, [refreshLedgerBalancesOnly, onAgencyFinancialUpdate]);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];

    const currency = (company as any)?.devise ?? "XOF";
    const runEnsure = () =>
      ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom).then(async () => {
        const [balRes, posRes] = await Promise.allSettled([
          getLedgerBalances(companyId, agencyId),
          getAgencyCashPosition(companyId, agencyId),
        ]);
        if (balRes.status === "fulfilled") setCashPosition(balRes.value.cash);
        if (posRes.status === "fulfilled") {
          setLedgerCashFromTransactions({
            soldeCash: posRes.value.soldeCash,
            capped: posRes.value.capped,
          });
        } else {
          setLedgerCashFromTransactions(null);
        }
      });
    runEnsure().catch((err: any) => {
      if (err?.code === "permission-denied" || err?.message?.includes("permission")) {
        setTimeout(() => runEnsure().catch(() => {}), 1500);
      }
    });

    unsubs.push(onSnapshot(
      query(
        collection(db, `companies/${companyId}/financialTransactions`),
        where("agencyId", "==", agencyId),
        orderBy("performedAt", "desc"),
        limit(20)
      ),
      (s) =>
        setLedgerRows(
          s.docs.map((d) => {
            const x = d.data() as Record<string, unknown>;
            return {
              id: d.id,
              amount: Number(x.amount ?? 0),
              type: x.type != null ? String(x.type) : undefined,
              referenceType: x.referenceType != null ? String(x.referenceType) : undefined,
              performedAt: x.performedAt,
              paymentMethod: x.paymentMethod != null ? String(x.paymentMethod) : undefined,
              status: x.status != null ? String(x.status) : undefined,
            };
          })
        )
    ));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["closed", "validated_agency", "validated"]), limit(100)),
      (s) => setShifts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));
    unsubs.push(onSnapshot(
      query(collection(db, courierSessionsRef(db, companyId, agencyId).path),
        where("status", "in", ["CLOSED", "VALIDATED_AGENCY", "VALIDATED"]), limit(100)),
      (s) => setCourierSessions(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    ));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shiftReports`), limit(200)),
      (snap) => {
        const next: Record<string, ShiftReportDoc> = {};
        snap.docs.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          next[d.id] = {
            id: d.id,
            billets: Number(x.billets ?? 0),
            montant: Number(x.montant ?? 0),
            details: Array.isArray(x.details) ? (x.details as ShiftReportDoc["details"]) : [],
          };
        });
        setShiftReportsById(next);
      }
    ));

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, company]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const refresh = () => {
      const incidents = listChefIncidents(companyId, agencyId)
        .filter((i) => i.status === "open")
        .map((i) => ({
          id: i.id,
          severity: i.severity,
          reason: i.reason,
          relatedSessionId: i.relatedSessionId,
          createdAtIso: i.createdAtIso,
        }));
      setOpenIncidents(incidents);
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [companyId, agencyId]);

  /* ── Date-filtered revenue (métier / unified hint) et dépenses ── */
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const { start, end } = dateFilter.range;
    const startKey = dayjs(start).tz(agencyTz).format("YYYY-MM-DD");
    const endKey = dayjs(end).tz(agencyTz).format("YYYY-MM-DD");

    getUnifiedAgencyFinance(companyId, agencyId, startKey, endKey, agencyTz)
      .then((stats) => {
        setRevenue(stats.activity.sales.amountHint);
        setTickets(stats.activity.sales.tickets);
      })
      .catch(() => {
        setRevenue(0);
        setTickets(0);
      });

    const rangeStartBm = dayjs(start).tz(agencyTz).startOf("day").toDate();
    const rangeEndBm = dayjs(end).tz(agencyTz).endOf("day").toDate();
    listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 200 }).then((list) => {
      const filtered = list.filter((e) => {
        const d = (e as any).createdAt?.toDate?.() ?? new Date();
        return d >= rangeStartBm && d <= rangeEndBm;
      });
      setExpenses(filtered.reduce((a, e) => a + e.amount, 0));
    });
  }, [
    companyId,
    agencyId,
    agencyTz,
    dateFilter.range.start.getTime(),
    dateFilter.range.end.getTime(),
    financeKpiRefreshKey,
  ]);

  /* ── Today : encaissements ledger (FINANCIAL_TRUTH) + dépenses en attente (opérationnel) ── */
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const dayStart = getStartOfDay(agencyTz);
    const dayEndExclusive = new Date(getEndOfDay(agencyTz).getTime() + 1);

    getAgencyLedgerPaymentReceivedTotalForPeriod(companyId, agencyId, dayStart, dayEndExclusive)
      .then((r) => setTodayLedgerEncaissements(r.total))
      .catch(() => setTodayLedgerEncaissements(0));

    const todayStart = getStartOfDay(agencyTz);
    const todayEnd = getEndOfDay(agencyTz);
    listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 200 }).then((list) => {
      const filtered = list.filter((e) => {
        const d = (e as any).createdAt?.toDate?.() ?? new Date();
        return d >= todayStart && d <= todayEnd;
      });
      setTodayExpenses(filtered.reduce((a, e) => a + e.amount, 0));
    });
  }, [companyId, agencyId, agencyTz, financeKpiRefreshKey]);

  /**
   * FINANCIAL_TRUTH : écart entre solde caisse espèces (accounts) et le même solde reconstitué
   * depuis les écritures financialTransactions. Ne compare pas aux ventes réservations.
   */
  const accountsVsLedgerTxVariance =
    ledgerCashFromTransactions != null ? cashPosition - ledgerCashFromTransactions.soldeCash : 0;
  const hasAccountsVsLedgerTxVariance =
    ledgerCashFromTransactions != null &&
    (Math.abs(accountsVsLedgerTxVariance) > 0.01 || ledgerCashFromTransactions.capped);

  const pendingApproval = useMemo(
    () => shifts.filter((s) => s.status === "validated_agency"), [shifts]);
  const closedShifts = useMemo(
    () => shifts.filter((s) => s.status === "closed"), [shifts]);
  const closedCourierSessions = useMemo(
    () => courierSessions.filter((s) => s.status === "CLOSED"),
    [courierSessions]
  );
  const pendingCourierChefApproval = useMemo(
    () => courierSessions.filter((s) => s.status === "VALIDATED_AGENCY"),
    [courierSessions]
  );

  const courierSessionsForLedgerHint = useMemo(
    () => [...closedCourierSessions, ...pendingCourierChefApproval],
    [closedCourierSessions, pendingCourierChefApproval]
  );

  useEffect(() => {
    if (!companyId) return;
    const ids = courierSessionsForLedgerHint.map((s) => s.id).filter(Boolean);
    if (ids.length === 0) {
      setCourierExpectedBySessionId({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const total = await getCourierSessionLedgerTotal(companyId, id);
            return [id, Number(total || 0)] as const;
          } catch {
            return [id, 0] as const;
          }
        })
      );
      if (cancelled) return;
      setCourierExpectedBySessionId(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, courierSessionsForLedgerHint]);
  const blockedClosedShifts = useMemo(
    () =>
      closedShifts.filter((s) => {
        const startMs = s.startTime?.toDate?.()?.getTime?.() ?? 0;
        const isOld = startMs > 0 && Date.now() - startMs > 8 * 3600_000;
        return isOld && !s.exceptionalValidation?.requested;
      }),
    [closedShifts]
  );

  const refundModalRow = refundTargetId ? ledgerRows.find((r) => r.id === refundTargetId) : null;
  const refundModalAbsAmount = refundModalRow ? Math.abs(refundModalRow.amount) : 0;
  const refundModalExpectedChannel: "cash" | "mobile_money" =
    refundModalRow && String(refundModalRow.paymentMethod ?? "").toLowerCase() === "cash" ? "cash" : "mobile_money";

  const openRefundModal = (rowId: string) => {
    setRefundReason("");
    setRefundTargetId(rowId);
  };

  const refundChannelLabel =
    refundModalExpectedChannel === "cash" ? "Espèces (caisse agence)" : "Mobile money";

  const submitLedgerRefund = async () => {
    if (!companyId || !agencyId || !user?.uid || !refundTargetId) return;
    const reason = refundReason.trim();
    if (!reason) {
      toast.error("Indiquez une raison.");
      return;
    }
    setRefundSubmitting(true);
    try {
      const res = await refundPayment({
        companyId,
        agencyId,
        originalTransactionId: refundTargetId,
        channel: refundModalExpectedChannel,
        reason,
        performedBy: { uid: user.uid, name: user.displayName ?? null, role: user.role },
      });
      toast.success(
        res.idempotentReplay
          ? "Remboursement déjà présent — effets métier rejoués si possible."
          : "Remboursement ledger enregistré."
      );
      setRefundTargetId(null);
      notifyAgencyFinancialChange();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Échec du remboursement.");
    } finally {
      setRefundSubmitting(false);
    }
  };

  const handleApprove = async (shiftId: string) => {
    if (!companyId || !agencyId || !user?.uid) return;
    setBusyShiftId(shiftId);
    try {
      await validateSessionByHeadAccountant({
        companyId,
        agencyId,
        shiftId,
        validatedBy: { id: user.uid, name: user.displayName ?? user.nom ?? user.email ?? "Chef d'agence" },
      });
      notifyAgencyFinancialChange();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erreur lors de la validation");
    } finally { setBusyShiftId(null); }
  };

  const handleApproveCourierSession = async (sessionId: string) => {
    if (!companyId || !agencyId || !user?.uid) return;
    setBusyCourierSessionId(sessionId);
    try {
      await validateCourierSessionByHeadAccountant({
        companyId,
        agencyId,
        sessionId,
        validatedBy: { id: user.uid, name: user.displayName ?? user.nom ?? user.email ?? "Chef d'agence" },
      });
      notifyAgencyFinancialChange();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erreur lors de la validation courrier");
    } finally {
      setBusyCourierSessionId(null);
    }
  };

  const handleExceptionalValidation = async (shiftId: string) => {
    if (!companyId || !agencyId || !user?.uid) return;
    const reason = exceptionReason.trim();
    if (!reason) {
      toast.error("Motif requis.");
      return;
    }
    setExceptionSubmitting(true);
    try {
      await chefExceptionalValidation({
        companyId,
        agencyId,
        shiftId,
        userId: user.uid,
        userName: user.displayName ?? user.nom ?? user.email ?? "Chef d'agence",
        reason,
      });
      toast.success("Validation exceptionnelle journalisée.");
      setExceptionTargetId(null);
      setExceptionReason("");
      notifyAgencyFinancialChange();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Impossible d'enregistrer l'exception.");
    } finally {
      setExceptionSubmitting(false);
    }
  };

  if (loading) {
    return embedded ? (
      <div className="py-4"><p className={typography.muted}>Chargement…</p></div>
    ) : (
      <StandardLayoutWrapper><p className={typography.muted}>Chargement…</p></StandardLayoutWrapper>
    );
  }

  const filterBar = (
    <DateFilterBar
      preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
      customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
      onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
    />
  );

  const financesBody = (
    <>
      {embedded ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {filterBar}
        </div>
      ) : (
      <PageHeader
        title="Pilotage financier agence"
        subtitle={`${format(new Date(), "EEEE d MMMM yyyy", { locale: fr })} — validation des postes et contrôle de caisse`}
        right={filterBar}
      />
      )}

      {!embedded && (
      <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
        Les blocs <strong>opérationnel</strong> et <strong>comptabilité</strong> ci-dessous ne sont pas comparés entre eux (contrat
        de temps).
      </div>
      )}
      {embedded && hasAccountsVsLedgerTxVariance && (
        <div
          className={cn(
            "mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 text-sm font-semibold",
            "border-amber-600 bg-amber-50 text-amber-950 dark:border-amber-500 dark:bg-amber-950/35 dark:text-amber-100"
          )}
          role="status"
        >
          <span>Écart caisse (comptes vs écritures)</span>
          <span className="tabular-nums">
            {money(Math.abs(accountsVsLedgerTxVariance))}
            {ledgerCashFromTransactions?.capped ? " · données partielles" : ""}
          </span>
        </div>
      )}

      {embedded && (
        <SectionCard title="Incidents ouverts (supervision)" icon={CheckCircle2} className="mb-4">
          {openIncidents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Aucun incident ouvert.</p>
          ) : (
            <div className="space-y-2">
              {openIncidents.slice(0, 8).map((i) => (
                <div
                  key={i.id}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm",
                    i.severity === "critical"
                      ? "border-red-300 bg-red-50/70 dark:border-red-700 dark:bg-red-950/20"
                      : "border-amber-300 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-950/20"
                  )}
                >
                  <div className="font-medium text-gray-900 dark:text-white">Session {i.relatedSessionId}</div>
                  <div className="text-xs text-gray-600 dark:text-slate-400">{i.reason}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {embedded && (
        <SectionCard title="Arbitrages de validation" icon={CheckCircle2} noPad className="mb-4">
          {pendingApproval.length === 0 &&
          pendingCourierChefApproval.length === 0 &&
          closedShifts.length === 0 &&
          closedCourierSessions.length === 0 ? (
            <EmptyState message="Aucun rapport en attente de validation." />
          ) : (
            <div className={table.wrapper}>
              <table className={table.base}>
                <thead className="bg-gradient-to-r from-slate-50 to-indigo-50/70 dark:from-slate-900 dark:to-indigo-950/30">
                  <tr>
                    <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Guichetier</th>
                    <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Début</th>
                    <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Fin</th>
                    <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Statut</th>
                    <th className={cn(table.thRight, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Action</th>
                  </tr>
                </thead>
                <tbody className={table.body}>
                  {closedShifts.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr className={tableRowClassName()}>
                        <td className={table.td}>{s.userName ?? s.userId}</td>
                        <td className={table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                        <td className={table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                        <td className={table.td}>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <StatusBadge status="pending">En attente du comptable</StatusBadge>
                            {s.exceptionalValidation?.requested ? (
                              <StatusBadge status="warning">Exception journalisée</StatusBadge>
                            ) : null}
                          </div>
                        </td>
                        <td className={table.tdRight}>
                          {blockedClosedShifts.some((x) => x.id === s.id) ? (
                            <ActionButton size="sm" variant="secondary" onClick={() => setExceptionTargetId(s.id)}>
                              Validation exceptionnelle
                            </ActionButton>
                          ) : (
                            <span className={typography.muted}>En attente</span>
                          )}
                        </td>
                      </tr>
                      <tr className={tableRowClassName()}>
                        <td className={table.td} colSpan={5}>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
                              <span className="font-semibold">Détails activité session</span>
                              <span>Billets: <b>{shiftReportsById[s.id]?.billets ?? 0}</b></span>
                              <span>Montant à verser: <b>{money(shiftReportsById[s.id]?.montant ?? 0)}</b></span>
                            </div>
                            {shiftReportsById[s.id]?.details && shiftReportsById[s.id]!.details!.length > 0 ? (
                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left">Trajet</th>
                                      <th className="px-2 py-1.5 text-right">Billets</th>
                                      <th className="px-2 py-1.5 text-right">Montant</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shiftReportsById[s.id]!.details!.map((d, i) => (
                                      <tr key={`${s.id}-closed-${i}`} className="border-t border-slate-100">
                                        <td className="px-2 py-1.5">{d.trajet ?? "—"}</td>
                                        <td className="px-2 py-1.5 text-right">{Number(d.billets ?? 0)}</td>
                                        <td className="px-2 py-1.5 text-right">{money(Number(d.montant ?? 0))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">Aucun détail de trajet disponible pour cette session.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {closedCourierSessions.map((s) => (
                    <React.Fragment key={`courier-${s.id}`}>
                      <tr className={tableRowClassName()}>
                        <td className={table.td}>Agent courrier {s.agentCode ?? "—"}</td>
                        <td className={table.td}>
                          {(s.openedAt as any)?.toDate ? format((s.openedAt as any).toDate(), "HH:mm", { locale: fr }) : "—"}
                        </td>
                        <td className={table.td}>
                          {(s.closedAt as any)?.toDate ? format((s.closedAt as any).toDate(), "HH:mm", { locale: fr }) : "—"}
                        </td>
                        <td className={table.td}>
                          <StatusBadge status="pending">Courrier — en attente du comptable</StatusBadge>
                        </td>
                        <td className={table.tdRight}>
                          <span className={typography.muted}>En attente</span>
                        </td>
                      </tr>
                      <tr className={tableRowClassName()}>
                        <td className={table.td} colSpan={5}>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-semibold">Détails activité session</span>
                              <span>Montant à verser (référence comptable): <b>{money(courierExpectedBySessionId[s.id] ?? 0)}</b></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {pendingApproval.map((s) => (
                    <React.Fragment key={s.id}>
                      <tr className={tableRowClassName()}>
                        <td className={table.td}>{s.userName ?? s.userId}</td>
                        <td className={table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                        <td className={table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                        <td className={table.td}><StatusBadge status="info">Validé compta — à approuver</StatusBadge></td>
                        <td className={table.tdRight}>
                          <ActionButton disabled={busyShiftId === s.id} onClick={() => handleApprove(s.id)} variant="primary" size="sm">
                            {busyShiftId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Approuver
                          </ActionButton>
                        </td>
                      </tr>
                      <tr className={tableRowClassName()}>
                        <td className={table.td} colSpan={5}>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
                              <span className="font-semibold">Détails activité session</span>
                              <span>Billets: <b>{shiftReportsById[s.id]?.billets ?? 0}</b></span>
                              <span>Montant: <b>{money(shiftReportsById[s.id]?.montant ?? 0)}</b></span>
                            </div>
                            {shiftReportsById[s.id]?.details && shiftReportsById[s.id]!.details!.length > 0 ? (
                              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                                <table className="w-full text-xs">
                                  <thead className="bg-slate-100">
                                    <tr>
                                      <th className="px-2 py-1.5 text-left">Trajet</th>
                                      <th className="px-2 py-1.5 text-right">Billets</th>
                                      <th className="px-2 py-1.5 text-right">Montant</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {shiftReportsById[s.id]!.details!.map((d, i) => (
                                      <tr key={`${s.id}-${i}`} className="border-t border-slate-100">
                                        <td className="px-2 py-1.5">{d.trajet ?? "—"}</td>
                                        <td className="px-2 py-1.5 text-right">{Number(d.billets ?? 0)}</td>
                                        <td className="px-2 py-1.5 text-right">{money(Number(d.montant ?? 0))}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">Aucun détail de trajet disponible pour cette session.</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                  {pendingCourierChefApproval.map((s) => (
                    <React.Fragment key={`courier-chef-${s.id}`}>
                      <tr className={tableRowClassName()}>
                        <td className={table.td}>Courrier {s.agentCode ?? "—"}</td>
                        <td className={table.td}>
                          {(s.openedAt as { toDate?: () => Date } | undefined)?.toDate
                            ? format((s.openedAt as { toDate: () => Date }).toDate(), "HH:mm", { locale: fr })
                            : "—"}
                        </td>
                        <td className={table.td}>
                          {(s.closedAt as { toDate?: () => Date } | undefined)?.toDate
                            ? format((s.closedAt as { toDate: () => Date }).toDate(), "HH:mm", { locale: fr })
                            : "—"}
                        </td>
                        <td className={table.td}><StatusBadge status="info">Validé compta — à approuver</StatusBadge></td>
                        <td className={table.tdRight}>
                          <ActionButton
                            disabled={busyCourierSessionId === s.id}
                            onClick={() => handleApproveCourierSession(s.id)}
                            variant="primary"
                            size="sm"
                          >
                            {busyCourierSessionId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Approuver
                          </ActionButton>
                        </td>
                      </tr>
                      <tr className={tableRowClassName()}>
                        <td className={table.td} colSpan={5}>
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-semibold">Session courrier</span>
                              <span>Montant compté (comptable): <b>{money(Number(s.validatedAmount ?? 0))}</b></span>
                              <span>Réf. ledger colis: <b>{money(courierExpectedBySessionId[s.id] ?? 0)}</b></span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {!embedded && (
      <>
      <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 mb-4 dark:border-blue-900/30 dark:bg-blue-950/20">
        <p className="text-xs font-semibold text-blue-900 dark:text-blue-200 mb-3">Opérationnel (période filtre, Bamako)</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3">
          <MetricCard
            label="CA période (terrain)"
            value={money(revenue)}
            icon={Banknote}
            valueColorVar="#059669"
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <MetricCard
            label="Billets période (terrain)"
            value={tickets}
            icon={Ticket}
            valueColorVar="#1d4ed8"
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <MetricCard
            label="Dépenses (en attente)"
            value={money(expenses)}
            icon={TrendingDown}
            valueColorVar="#b91c1c"
            hint={AGENCY_KPI_TIME.WORKFLOW_PAIEMENT}
          />
        </div>
      </div>
      <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-4 mb-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
        <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200 mb-3">Comptabilité</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3">
          <MetricCard
            label="Caisse espèces (accounts)"
            value={money(cashPosition)}
            icon={Wallet}
            valueColorVar="#4f46e5"
            hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
          />
          <MetricCard
            label="Encaissements du jour"
            value={money(todayLedgerEncaissements)}
            icon={Banknote}
            valueColorVar="#0d9488"
            hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
          />
          <MetricCard
            label="Écart accounts vs écritures"
            value={
              ledgerCashFromTransactions != null ? money(Math.abs(accountsVsLedgerTxVariance)) : "—"
            }
            icon={ArrowRightLeft}
            critical={hasAccountsVsLedgerTxVariance}
            criticalMessage={
              hasAccountsVsLedgerTxVariance
                ? ledgerCashFromTransactions?.capped
                  ? "Lecture ledger tronquée — vérifier la cohérence"
                  : "Écart entre soldes comptes et somme des transactions"
                : undefined
            }
            valueColorVar={hasAccountsVsLedgerTxVariance ? undefined : "#059669"}
            hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
          />
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1 mb-2">
        Dépenses jour (indicatif, même filtre Bamako que les encaissements jour) : {money(todayExpenses)}
      </p>
      </>
      )}

      {embedded && (
        <details className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
            Synthèse chiffrée (ventes &amp; ledger)
          </summary>
          <div className="space-y-4 border-t border-gray-100 px-3 pb-4 pt-3 dark:border-gray-800">
            <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-4 dark:border-blue-900/30 dark:bg-blue-950/20">
              <p className="mb-3 text-xs font-semibold text-blue-900 dark:text-blue-200">Opérationnel (période filtre)</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  label="CA période (terrain)"
                  value={money(revenue)}
                  icon={Banknote}
                  valueColorVar="#059669"
                  hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
                />
                <MetricCard
                  label="Billets période (terrain)"
                  value={tickets}
                  icon={Ticket}
                  valueColorVar="#1d4ed8"
                  hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
                />
                <MetricCard
                  label="Dépenses (en attente)"
                  value={money(expenses)}
                  icon={TrendingDown}
                  valueColorVar="#b91c1c"
                  hint={AGENCY_KPI_TIME.WORKFLOW_PAIEMENT}
                />
              </div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/30 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
              <p className="mb-3 text-xs font-semibold text-emerald-900 dark:text-emerald-200">Comptabilité</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard
                  label="Caisse espèces (accounts)"
                  value={money(cashPosition)}
                  icon={Wallet}
                  valueColorVar="#4f46e5"
                  hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
                />
                <MetricCard
                  label="Encaissements du jour"
                  value={money(todayLedgerEncaissements)}
                  icon={Banknote}
                  valueColorVar="#0d9488"
                  hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
                />
                <MetricCard
                  label="Écart accounts vs écritures"
                  value={ledgerCashFromTransactions != null ? money(Math.abs(accountsVsLedgerTxVariance)) : "—"}
                  icon={ArrowRightLeft}
                  critical={hasAccountsVsLedgerTxVariance}
                  criticalMessage={
                    hasAccountsVsLedgerTxVariance
                      ? ledgerCashFromTransactions?.capped
                        ? "Lecture ledger tronquée — vérifier la cohérence"
                        : "Écart entre soldes comptes et somme des transactions"
                      : undefined
                  }
                  valueColorVar={hasAccountsVsLedgerTxVariance ? undefined : "#059669"}
                  hint={AGENCY_KPI_TIME.LEDGER_BAMAKO}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400">Dépenses jour (indicatif) : {money(todayExpenses)}</p>
          </div>
        </details>
      )}

      {embedded && (
        <details className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white [&::-webkit-details-marker]:hidden">
            Dernières écritures comptables
          </summary>
          <div className="border-t border-gray-100 px-2 pb-2 pt-2 dark:border-gray-800 sm:px-3">
            {ledgerRows.length === 0 ? (
              <EmptyState message="Aucune écriture ledger récente." />
            ) : (
              <div className={table.wrapper}>
                <table className={table.base}>
                  <thead className={table.head}>
                    <tr>
                      <th className={table.th}>Type</th>
                      <th className={table.th}>Référence</th>
                      <th className={table.thRight}>Montant</th>
                      <th className={table.thRight}>Action</th>
                    </tr>
                  </thead>
                  <tbody className={table.body}>
                    {ledgerRows.map((m) => {
                      const canRefund =
                        m.type === "payment_received" &&
                        Math.abs(m.amount) > 0 &&
                        isConfirmedTransactionStatus(m.status as "confirmed" | undefined);
                      return (
                        <tr key={m.id} className={tableRowClassName()}>
                          <td className={table.td}>
                            <StatusBadge status="info">{m.type ?? "—"}</StatusBadge>
                          </td>
                          <td className={table.td}>{m.referenceType ?? "—"}</td>
                          <td className={table.tdRight}>{money(m.amount)}</td>
                          <td className={table.tdRight}>
                            {canRefund ? (
                              <ActionButton variant="secondary" size="sm" onClick={() => openRefundModal(m.id)}>
                                <Undo2 className="mr-1 h-4 w-4" />
                                Annuler et rembourser
                              </ActionButton>
                            ) : (
                              <span className={typography.muted}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </details>
      )}

      {!embedded && (
      <>
      <SectionCard title="Arbitrages de validation" icon={CheckCircle2} noPad>
        {pendingApproval.length === 0 &&
        pendingCourierChefApproval.length === 0 &&
        closedShifts.length === 0 &&
        closedCourierSessions.length === 0 ? (
          <EmptyState message="Aucun rapport en attente de validation." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className="bg-gradient-to-r from-slate-50 to-indigo-50/70 dark:from-slate-900 dark:to-indigo-950/30">
                <tr>
                  <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Guichetier</th>
                  <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Début</th>
                  <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Fin</th>
                  <th className={cn(table.th, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Statut</th>
                  <th className={cn(table.thRight, "text-[11px] font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200")}>Action</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {closedShifts.map((s) => (
                  <React.Fragment key={s.id}>
                    <tr className={tableRowClassName()}>
                      <td className={table.td}>{s.userName ?? s.userId}</td>
                      <td className={table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                      <td className={table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                      <td className={table.td}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status="pending">En attente du comptable</StatusBadge>
                          {s.exceptionalValidation?.requested ? (
                            <StatusBadge status="warning">Exception journalisée</StatusBadge>
                          ) : null}
                        </div>
                      </td>
                      <td className={table.tdRight}>
                        {blockedClosedShifts.some((x) => x.id === s.id) ? (
                          <ActionButton size="sm" variant="secondary" onClick={() => setExceptionTargetId(s.id)}>
                            Validation exceptionnelle
                          </ActionButton>
                        ) : (
                          <span className={typography.muted}>En attente</span>
                        )}
                      </td>
                    </tr>
                    <tr className={tableRowClassName()}>
                      <td className={table.td} colSpan={5}>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
                            <span className="font-semibold">Détails activité session</span>
                            <span>Billets: <b>{shiftReportsById[s.id]?.billets ?? 0}</b></span>
                            <span>Montant à verser: <b>{money(shiftReportsById[s.id]?.montant ?? 0)}</b></span>
                          </div>
                          {shiftReportsById[s.id]?.details && shiftReportsById[s.id]!.details!.length > 0 ? (
                            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left">Trajet</th>
                                    <th className="px-2 py-1.5 text-right">Billets</th>
                                    <th className="px-2 py-1.5 text-right">Montant</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {shiftReportsById[s.id]!.details!.map((d, i) => (
                                    <tr key={`${s.id}-closed-nonembedded-${i}`} className="border-t border-slate-100">
                                      <td className="px-2 py-1.5">{d.trajet ?? "—"}</td>
                                      <td className="px-2 py-1.5 text-right">{Number(d.billets ?? 0)}</td>
                                      <td className="px-2 py-1.5 text-right">{money(Number(d.montant ?? 0))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Aucun détail de trajet disponible pour cette session.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
                {closedCourierSessions.map((s) => (
                  <React.Fragment key={`courier-${s.id}`}>
                    <tr className={tableRowClassName()}>
                      <td className={table.td}>Agent courrier {s.agentCode ?? "—"}</td>
                      <td className={table.td}>
                        {(s.openedAt as any)?.toDate ? format((s.openedAt as any).toDate(), "HH:mm", { locale: fr }) : "—"}
                      </td>
                      <td className={table.td}>
                        {(s.closedAt as any)?.toDate ? format((s.closedAt as any).toDate(), "HH:mm", { locale: fr }) : "—"}
                      </td>
                      <td className={table.td}>
                        <StatusBadge status="pending">Courrier — en attente du comptable</StatusBadge>
                      </td>
                      <td className={table.tdRight}>
                        <span className={typography.muted}>En attente</span>
                      </td>
                    </tr>
                    <tr className={tableRowClassName()}>
                      <td className={table.td} colSpan={5}>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-semibold">Détails activité session</span>
                            <span>Montant à verser (référence comptable): <b>{money(courierExpectedBySessionId[s.id] ?? 0)}</b></span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
                {pendingApproval.map((s) => (
                  <React.Fragment key={s.id}>
                    <tr className={tableRowClassName()}>
                      <td className={table.td}>{s.userName ?? s.userId}</td>
                      <td className={table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                      <td className={table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                      <td className={table.td}><StatusBadge status="info">Validé compta — à approuver</StatusBadge></td>
                      <td className={table.tdRight}>
                        <ActionButton disabled={busyShiftId === s.id} onClick={() => handleApprove(s.id)} variant="primary" size="sm">
                          {busyShiftId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Approuver
                        </ActionButton>
                      </td>
                    </tr>
                    <tr className={tableRowClassName()}>
                      <td className={table.td} colSpan={5}>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
                            <span className="font-semibold">Détails activité session</span>
                            <span>Billets: <b>{shiftReportsById[s.id]?.billets ?? 0}</b></span>
                            <span>Montant: <b>{money(shiftReportsById[s.id]?.montant ?? 0)}</b></span>
                          </div>
                          {shiftReportsById[s.id]?.details && shiftReportsById[s.id]!.details!.length > 0 ? (
                            <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                              <table className="w-full text-xs">
                                <thead className="bg-slate-100">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left">Trajet</th>
                                    <th className="px-2 py-1.5 text-right">Billets</th>
                                    <th className="px-2 py-1.5 text-right">Montant</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {shiftReportsById[s.id]!.details!.map((d, i) => (
                                    <tr key={`${s.id}-${i}`} className="border-t border-slate-100">
                                      <td className="px-2 py-1.5">{d.trajet ?? "—"}</td>
                                      <td className="px-2 py-1.5 text-right">{Number(d.billets ?? 0)}</td>
                                      <td className="px-2 py-1.5 text-right">{money(Number(d.montant ?? 0))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500">Aucun détail de trajet disponible pour cette session.</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
                {pendingCourierChefApproval.map((s) => (
                  <React.Fragment key={`courier-chef-${s.id}`}>
                    <tr className={tableRowClassName()}>
                      <td className={table.td}>Courrier {s.agentCode ?? "—"}</td>
                      <td className={table.td}>
                        {(s.openedAt as { toDate?: () => Date } | undefined)?.toDate
                          ? format((s.openedAt as { toDate: () => Date }).toDate(), "HH:mm", { locale: fr })
                          : "—"}
                      </td>
                      <td className={table.td}>
                        {(s.closedAt as { toDate?: () => Date } | undefined)?.toDate
                          ? format((s.closedAt as { toDate: () => Date }).toDate(), "HH:mm", { locale: fr })
                          : "—"}
                      </td>
                      <td className={table.td}><StatusBadge status="info">Validé compta — à approuver</StatusBadge></td>
                      <td className={table.tdRight}>
                        <ActionButton
                          disabled={busyCourierSessionId === s.id}
                          onClick={() => handleApproveCourierSession(s.id)}
                          variant="primary"
                          size="sm"
                        >
                          {busyCourierSessionId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Approuver
                        </ActionButton>
                      </td>
                    </tr>
                    <tr className={tableRowClassName()}>
                      <td className={table.td} colSpan={5}>
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                          <div className="flex flex-wrap items-center gap-3">
                            <span className="font-semibold">Session courrier</span>
                            <span>Montant compté (comptable): <b>{money(Number(s.validatedAmount ?? 0))}</b></span>
                            <span>Réf. ledger colis: <b>{money(courierExpectedBySessionId[s.id] ?? 0)}</b></span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Dernières écritures comptables" icon={ArrowRightLeft} noPad>
        {ledgerRows.length === 0 ? (
          <EmptyState message="Aucune écriture ledger récente." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Type</th>
                  <th className={table.th}>Référence</th>
                  <th className={table.thRight}>Montant</th>
                  <th className={table.thRight}>Action</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {ledgerRows.map((m) => {
                  const canRefund =
                    m.type === "payment_received" &&
                    Math.abs(m.amount) > 0 &&
                    isConfirmedTransactionStatus(m.status as "confirmed" | undefined);
                  return (
                    <tr key={m.id} className={tableRowClassName()}>
                      <td className={table.td}>
                        <StatusBadge status="info">{m.type ?? "—"}</StatusBadge>
                      </td>
                      <td className={table.td}>{m.referenceType ?? "—"}</td>
                      <td className={table.tdRight}>{money(m.amount)}</td>
                      <td className={table.tdRight}>
                        {canRefund ? (
                          <ActionButton variant="secondary" size="sm" onClick={() => openRefundModal(m.id)}>
                            <Undo2 className="w-4 h-4 mr-1" />
                            Annuler et rembourser
                          </ActionButton>
                        ) : (
                          <span className={typography.muted}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
      </>
      )}

      {refundModalRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ledger-refund-title"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <h2 id="ledger-refund-title" className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Annuler et rembourser (ledger)
            </h2>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">
              Une nouvelle écriture <strong>refund</strong> (montant négatif) sera créée. La transaction d’origine
              reste inchangée.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <div className="text-xs font-medium text-gray-500">Montant (depuis le ledger)</div>
                <div className="text-base font-semibold">{money(refundModalAbsAmount)}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Canal (aligné sur l’encaissement d’origine)</div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800">
                  {refundChannelLabel}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Raison</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[88px] dark:bg-slate-800 dark:border-slate-600"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Motif obligatoire…"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <ActionButton variant="secondary" onClick={() => setRefundTargetId(null)} disabled={refundSubmitting}>
                Fermer
              </ActionButton>
              <ActionButton onClick={() => void submitLedgerRefund()} disabled={refundSubmitting}>
                {refundSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Valider le remboursement
              </ActionButton>
            </div>
          </div>
        </div>
      )}
      {exceptionTargetId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl dark:border-slate-600 dark:bg-slate-900">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Validation exceptionnelle</h2>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-4">
              Cette action journalise une exception de supervision et ne remplace pas la validation comptable finale.
            </p>
            <label className="text-xs font-medium text-gray-500 block mb-1">Motif</label>
            <textarea
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm min-h-[88px] dark:bg-slate-800 dark:border-slate-600"
              value={exceptionReason}
              onChange={(e) => setExceptionReason(e.target.value)}
              placeholder="Blocage opérationnel, délai anormal, incident…"
            />
            <div className="flex justify-end gap-2 mt-4">
              <ActionButton variant="secondary" onClick={() => setExceptionTargetId(null)} disabled={exceptionSubmitting}>
                Annuler
              </ActionButton>
              <ActionButton onClick={() => void handleExceptionalValidation(exceptionTargetId)} disabled={exceptionSubmitting}>
                {exceptionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Enregistrer l'exception
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return embedded ? (
    <div className="space-y-4">{financesBody}</div>
  ) : (
    <StandardLayoutWrapper>{financesBody}</StandardLayoutWrapper>
  );
}
