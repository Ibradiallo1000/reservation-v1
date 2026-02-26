import React, { useEffect, useState, useMemo } from "react";
import {
  collection, query, where, getDocs, Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileBarChart2, Download } from "lucide-react";
import {
  KpiCard, SectionCard, StatusBadge, EmptyState, MGR,
  DateFilterBar,
} from "./ui";
import { useDateFilterContext } from "./DateFilterContext";

type ShiftDoc = {
  id: string; status: string; userId: string; userName?: string | null;
  userCode?: string; startTime?: any; endTime?: any;
  comptable?: { validated?: boolean; at?: any; by?: { name?: string } | null };
  chef?: { validated?: boolean; at?: any; by?: { name?: string } | null };
  lockedComptable?: boolean; lockedChef?: boolean;
};

export default function ManagerReportsPage() {
  const { user } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const dateFilter = useDateFilterContext();

  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }

    const loadData = async () => {
      setLoading(true);
      const { start, end } = dateFilter.range;

      const [shiftSnap, resSnap] = await Promise.all([
        getDocs(query(collection(db, `companies/${companyId}/agences/${agencyId}/shifts`), where("status", "==", "validated"))),
        getDocs(query(collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
          where("createdAt", ">=", Timestamp.fromDate(start)),
          where("createdAt", "<=", Timestamp.fromDate(end)),
          where("statut", "==", "payé"))),
      ]);

      setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
      setRevenue(resSnap.docs.reduce((a, d) => a + (d.data().montant ?? 0), 0));
      setTickets(resSnap.size);
      setLoading(false);
    };

    loadData();
  }, [companyId, agencyId, dateFilter.range.start.getTime(), dateFilter.range.end.getTime()]);

  const fullyApproved = useMemo(() => shifts.filter((s) => s.lockedChef), [shifts]);

  const handleExportCSV = () => {
    const header = "Guichetier,Code,Début,Fin,Validé Compta,Validé Chef\n";
    const rows = fullyApproved.map((s) => {
      const start = s.startTime?.toDate ? format(s.startTime.toDate(), "dd/MM/yyyy HH:mm") : "";
      const end = s.endTime?.toDate ? format(s.endTime.toDate(), "dd/MM/yyyy HH:mm") : "";
      return `"${s.userName ?? s.userId}","${s.userCode ?? ""}","${start}","${end}","Oui","Oui"`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapports-agence-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className={MGR.page}><p className={MGR.muted}>Chargement des rapports…</p></div>;

  return (
    <div className={MGR.page}>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className={MGR.h1}>Rapports</h1>
          <p className={MGR.muted}>{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateFilterBar
            preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
            customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
            onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
          />
          <button onClick={handleExportCSV} disabled={fullyApproved.length === 0} className={MGR.btnSecondary}>
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Revenu" value={money(revenue)} accent="text-emerald-700" />
        <KpiCard label="Billets" value={tickets} accent="text-blue-700" />
        <KpiCard label="Rapports validés" value={fullyApproved.length} accent="text-indigo-700"
          help="Nombre de rapports de session ayant été validés par le comptable ET approuvés par le chef d'agence." />
      </div>

      <SectionCard title="Rapports validés (comptable + chef)" icon={FileBarChart2} noPad
        help="Historique des sessions entièrement validées. Un rapport apparaît ici uniquement après la double validation (comptable + chef d'agence).">
        {fullyApproved.length === 0 ? (
          <EmptyState message="Aucun rapport entièrement validé." />
        ) : (
          <div className={MGR.table.wrapper}>
            <table className={MGR.table.base}>
              <thead className={MGR.table.head}>
                <tr>
                  <th className={MGR.table.th}>Guichetier</th>
                  <th className={MGR.table.th}>Code</th>
                  <th className={MGR.table.th}>Début</th>
                  <th className={MGR.table.th}>Fin</th>
                  <th className={MGR.table.th}>Validé compta</th>
                  <th className={MGR.table.th}>Approuvé chef</th>
                </tr>
              </thead>
              <tbody className={MGR.table.body}>
                {fullyApproved.map((s) => (
                  <tr key={s.id} className={MGR.table.row}>
                    <td className={MGR.table.td}>{s.userName ?? s.userId}</td>
                    <td className={MGR.table.td}>
                      <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{s.userCode ?? "—"}</code>
                    </td>
                    <td className={MGR.table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "dd/MM HH:mm") : "—"}</td>
                    <td className={MGR.table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "dd/MM HH:mm") : "—"}</td>
                    <td className={MGR.table.td}><StatusBadge color="green">{s.comptable?.by?.name ?? "Oui"}</StatusBadge></td>
                    <td className={MGR.table.td}><StatusBadge color="green">{s.chef?.by?.name ?? "Oui"}</StatusBadge></td>
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
