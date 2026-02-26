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
import { listExpenses } from "@/modules/compagnie/treasury/expenses";
import { chefApproveShift } from "@/modules/agence/services/chefApproveShift";
import {
  Banknote, Wallet, TrendingDown, ArrowRightLeft,
  CheckCircle2, Loader2,
} from "lucide-react";
import {
  KpiCard, SectionCard, StatusBadge, EmptyState, MGR,
  DateFilterBar,
} from "./ui";
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

    listExpenses(companyId, { agencyId, status: "pending", limitCount: 200 }).then((list) => {
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

    listExpenses(companyId, { agencyId, status: "pending", limitCount: 200 }).then((list) => {
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

  if (loading) return <div className={MGR.page}><p className={MGR.muted}>Chargement…</p></div>;

  return (
    <div className={MGR.page}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className={MGR.h1}>Finances</h1>
          <p className={MGR.muted}>{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
        </div>
        <DateFilterBar
          preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
          customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
          onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Revenu" value={money(revenue)} icon={Banknote} accent="text-emerald-700"
          help="Total des paiements encaissés sur la période sélectionnée." />
        <KpiCard label="Billets" value={tickets} icon={Banknote} accent="text-blue-700" />
        <KpiCard label="Dépenses" value={money(expenses)} icon={TrendingDown} accent="text-red-700"
          help="Total des dépenses enregistrées sur la période sélectionnée." />
        <KpiCard label="Position caisse" value={money(cashPosition)} icon={Wallet} accent="text-indigo-700"
          help="Solde actuel de tous les comptes de caisse de l'agence. Indépendant de la période." />
        <KpiCard label="Écart caisse" value={money(Math.abs(cashVariance))} icon={ArrowRightLeft}
          accent={hasCashVariance ? "text-red-700" : "text-emerald-700"}
          critical={hasCashVariance}
          help="Différence entre la position caisse attendue et la position réelle. Un écart nul signifie que la caisse est équilibrée." />
      </div>

      <SectionCard title="Rapports à valider" icon={CheckCircle2} noPad
        help="Rapports de session clôturés par les guichetiers. Flux : Guichetier clôture → Comptable valide → Chef d'agence approuve.">
        {pendingApproval.length === 0 && closedShifts.length === 0 ? (
          <EmptyState message="Aucun rapport en attente de validation." />
        ) : (
          <div className={MGR.table.wrapper}>
            <table className={MGR.table.base}>
              <thead className={MGR.table.head}>
                <tr>
                  <th className={MGR.table.th}>Guichetier</th>
                  <th className={MGR.table.th}>Début</th>
                  <th className={MGR.table.th}>Fin</th>
                  <th className={MGR.table.th}>Statut</th>
                  <th className={MGR.table.thRight}>Action</th>
                </tr>
              </thead>
              <tbody className={MGR.table.body}>
                {closedShifts.map((s) => (
                  <tr key={s.id} className={MGR.table.row}>
                    <td className={MGR.table.td}>{s.userName ?? s.userId}</td>
                    <td className={MGR.table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                    <td className={MGR.table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                    <td className={MGR.table.td}><StatusBadge color="yellow">En attente du comptable</StatusBadge></td>
                    <td className={MGR.table.tdRight}><span className={MGR.muted}>En attente</span></td>
                  </tr>
                ))}
                {pendingApproval.map((s) => (
                  <tr key={s.id} className={MGR.table.row}>
                    <td className={MGR.table.td}>{s.userName ?? s.userId}</td>
                    <td className={MGR.table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                    <td className={MGR.table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "HH:mm", { locale: fr }) : "—"}</td>
                    <td className={MGR.table.td}><StatusBadge color="blue">Validé compta — à approuver</StatusBadge></td>
                    <td className={MGR.table.tdRight}>
                      <button disabled={busyShiftId === s.id} onClick={() => handleApprove(s.id)} className={MGR.btnPrimary}>
                        {busyShiftId === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Approuver
                      </button>
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
          <div className={MGR.table.wrapper}>
            <table className={MGR.table.base}>
              <thead className={MGR.table.head}>
                <tr>
                  <th className={MGR.table.th}>Type</th>
                  <th className={MGR.table.th}>Description</th>
                  <th className={MGR.table.thRight}>Montant</th>
                </tr>
              </thead>
              <tbody className={MGR.table.body}>
                {movements.map((m) => (
                  <tr key={m.id} className={MGR.table.row}>
                    <td className={MGR.table.td}>
                      <StatusBadge color={m.movementType === "credit" ? "green" : "red"}>
                        {m.movementType === "credit" ? "Crédit" : "Débit"}
                      </StatusBadge>
                    </td>
                    <td className={MGR.table.td}>{m.description || "—"}</td>
                    <td className={MGR.table.tdRight}>{money(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
