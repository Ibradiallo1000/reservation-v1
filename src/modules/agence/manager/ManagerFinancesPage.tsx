import React, { useEffect, useState, useMemo } from "react";
import {
  collection, query, where, getDocs, onSnapshot, limit, orderBy, Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { listAccounts, ensureDefaultAgencyAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { listExpenses, PENDING_STATUSES } from "@/modules/compagnie/treasury/expenses";
import { chefApproveShift } from "@/modules/agence/services/chefApproveShift";
import {
  Banknote, Wallet, TrendingDown, ArrowRightLeft,
  CheckCircle2, Loader2, Ticket,
} from "lucide-react";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table, tableRowClassName, typography,
} from "@/ui";
import { useDateFilterContext } from "./DateFilterContext";

type ShiftDoc = {
  id: string; status: string; userId: string; userName?: string | null;
  startTime?: any; endTime?: any;
  comptable?: { validated?: boolean };
  lockedComptable?: boolean; lockedChef?: boolean;
};

export default function ManagerFinancesPage() {
  const { user, company } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const dateFilter = useDateFilterContext();

  const [revenue, setRevenue] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [cashPosition, setCashPosition] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [movements, setMovements] = useState<Array<{ id: string; amount: number; movementType: string; performedAt: any; description?: string }>>([]);
  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [busyShiftId, setBusyShiftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];

    const currency = (company as any)?.devise ?? "XOF";
    ensureDefaultAgencyAccounts(companyId, agencyId, currency, (company as any)?.nom).then(() => {
      listAccounts(companyId, { agencyId }).then((accs) =>
        setCashPosition(accs.reduce((s, a) => s + a.currentBalance, 0)));
    });

    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/financialMovements`),
        where("agencyId", "==", agencyId), orderBy("performedAt", "desc"), limit(20)),
      (s) => setMovements(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));
    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
        where("status", "in", ["closed", "validated"]), limit(100)),
      (s) => setShifts(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))));

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, company]);

  /* ── Date-filtered revenue/expenses (for display KPIs) ── */
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const { start, end } = dateFilter.range;
    const resRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);

    getDocs(query(resRef, where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<=", Timestamp.fromDate(end)), where("statut", "in", ["paye", "payé"])))
      .then((s) => {
        setRevenue(s.docs.reduce((a, d) => a + (d.data().montant ?? 0), 0));
        setTickets(s.size);
      });

    listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 200 }).then((list) => {
      const filtered = list.filter((e) => {
        const d = (e as any).createdAt?.toDate?.() ?? new Date();
        return d >= start && d <= end;
      });
      setExpenses(filtered.reduce((a, e) => a + e.amount, 0));
    });
  }, [companyId, agencyId, dateFilter.range.start.getTime(), dateFilter.range.end.getTime()]);

  /* ── Today-scoped data for cash variance (never affected by date filter) ── */
  useEffect(() => {
    if (!companyId || !agencyId) return;
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const resRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);

    getDocs(query(resRef, where("createdAt", ">=", Timestamp.fromDate(todayStart)),
      where("createdAt", "<=", Timestamp.fromDate(todayEnd)), where("statut", "in", ["paye", "payé"])))
      .then((s) => setTodayRevenue(s.docs.reduce((a, d) => a + (d.data().montant ?? 0), 0)));

    listExpenses(companyId, { agencyId, statusIn: [...PENDING_STATUSES], limitCount: 200 }).then((list) => {
      const filtered = list.filter((e) => {
        const d = (e as any).createdAt?.toDate?.() ?? new Date();
        return d >= todayStart && d <= todayEnd;
      });
      setTodayExpenses(filtered.reduce((a, e) => a + e.amount, 0));
    });
  }, [companyId, agencyId]);

  /*
   * CASH VARIANCE FORMULA (always today-scoped):
   * variance = cashPosition - (todayRevenue - todayExpenses)
   * A zero variance means the cash on hand matches today's net transactions.
   * This is NEVER affected by the global date filter.
   */
  const cashVariance = cashPosition - todayRevenue + todayExpenses;
  const hasCashVariance = cashVariance !== 0;

  const pendingApproval = useMemo(
    () => shifts.filter((s) => s.status === "validated" && s.lockedComptable && !s.lockedChef), [shifts]);
  const closedShifts = useMemo(
    () => shifts.filter((s) => s.status === "closed"), [shifts]);

  const handleApprove = async (shiftId: string) => {
    setBusyShiftId(shiftId);
    try {
      await chefApproveShift({
        companyId, agencyId, shiftId,
        userId: user?.uid ?? "", userName: user?.displayName ?? "",
      });
    } catch (e: any) {
      alert(e?.message ?? "Erreur lors de la validation");
    } finally { setBusyShiftId(null); }
  };

  if (loading) return <StandardLayoutWrapper><p className={typography.muted}>Chargement…</p></StandardLayoutWrapper>;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Pilotage financier agence"
        subtitle={`${format(new Date(), "EEEE d MMMM yyyy", { locale: fr })} — validation des postes et contrôle de caisse`}
        right={
          <DateFilterBar
            preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
            customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
            onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
          />
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <MetricCard label="CA période" value={money(revenue)} icon={Banknote} valueColorVar="#059669" />
        <MetricCard label="Billets période" value={tickets} icon={Ticket} valueColorVar="#1d4ed8" />
        <MetricCard label="Dépenses" value={money(expenses)} icon={TrendingDown} valueColorVar="#b91c1c" />
        <MetricCard label="Position caisse" value={money(cashPosition)} icon={Wallet} valueColorVar="#4f46e5" />
        <MetricCard
          label="Écart caisse"
          value={money(Math.abs(cashVariance))}
          icon={ArrowRightLeft}
          critical={hasCashVariance}
          criticalMessage={hasCashVariance ? "Écart de caisse détecté" : undefined}
          valueColorVar={hasCashVariance ? undefined : "#059669"}
        />
      </div>

      <SectionCard title="Arbitrages de validation" icon={CheckCircle2} noPad>
        {pendingApproval.length === 0 && closedShifts.length === 0 ? (
          <EmptyState message="Aucun rapport en attente de validation." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Guichetier</th>
                  <th className={table.th}>Début</th>
                  <th className={table.th}>Fin</th>
                  <th className={table.th}>Statut</th>
                  <th className={table.thRight}>Action</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {closedShifts.map((s) => (
                  <tr key={s.id} className={tableRowClassName()}>
                    <td className={table.td}>{s.userName ?? s.userId}</td>
                    <td className={table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                    <td className={table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                    <td className={table.td}><StatusBadge status="pending">En attente du comptable</StatusBadge></td>
                    <td className={table.tdRight}><span className={typography.muted}>En attente</span></td>
                  </tr>
                ))}
                {pendingApproval.map((s) => (
                  <tr key={s.id} className={tableRowClassName()}>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Derniers mouvements" icon={ArrowRightLeft} noPad>
        {movements.length === 0 ? (
          <EmptyState message="Aucun mouvement récent." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Type</th>
                  <th className={table.th}>Description</th>
                  <th className={table.thRight}>Montant</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {movements.map((m) => (
                  <tr key={m.id} className={tableRowClassName()}>
                    <td className={table.td}>
                      <StatusBadge status={m.movementType === "credit" ? "success" : "danger"}>
                        {m.movementType === "credit" ? "Crédit" : "Débit"}
                      </StatusBadge>
                    </td>
                    <td className={table.td}>{m.description || "—"}</td>
                    <td className={table.tdRight}>{money(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
