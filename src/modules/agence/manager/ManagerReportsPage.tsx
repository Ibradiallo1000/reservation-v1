import React, { useEffect, useState, useMemo } from "react";
import {
  collection, query, where, getDocs,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { FileBarChart2, Download } from "lucide-react";
import { DateFilterBar } from "./DateFilterBar";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, ActionButton, table, tableRowClassName, typography,
} from "@/ui";
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
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const dateFilter = useDateFilterContext();

  const [shifts, setShifts] = useState<ShiftDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }

    const loadData = async () => {
      setLoading(true);
      const { start, end } = dateFilter.range;

      const shiftSnap = await getDocs(
        query(
          collection(db, `companies/${companyId}/agences/${agencyId}/shifts`),
          where("status", "in", ["closed", "validated"])
        )
      );
      const inPeriod = shiftSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((s) => {
          const t =
            s.startTime?.toDate?.()?.getTime?.() ??
            s.createdAt?.toDate?.()?.getTime?.() ??
            null;
          if (t == null) return false;
          return t >= start.getTime() && t <= end.getTime();
        });
      setShifts(inPeriod);
      setLoading(false);
    };

    loadData();
  }, [companyId, agencyId, dateFilter.range.start.getTime(), dateFilter.range.end.getTime()]);

  const fullyApproved = useMemo(() => shifts.filter((s) => s.lockedChef), [shifts]);
  const pendingChefApproval = useMemo(
    () => shifts.filter((s) => s.lockedComptable && !s.lockedChef),
    [shifts]
  );
  const validationBase = fullyApproved.length + pendingChefApproval.length;
  const validationRate = validationBase > 0 ? Math.round((fullyApproved.length / validationBase) * 100) : 100;

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

  if (loading) return <StandardLayoutWrapper><p className={typography.muted}>Chargement des rapports…</p></StandardLayoutWrapper>;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Rapports"
        subtitle={`${format(new Date(), "EEEE d MMMM yyyy", { locale: fr })} — synthèse de conformité des postes`}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <DateFilterBar
              preset={dateFilter.preset} onPresetChange={dateFilter.setPreset}
              customStart={dateFilter.customStart} customEnd={dateFilter.customEnd}
              onCustomStartChange={dateFilter.setCustomStart} onCustomEndChange={dateFilter.setCustomEnd}
            />
            <ActionButton onClick={handleExportCSV} disabled={fullyApproved.length === 0} variant="secondary">
              <Download className="w-4 h-4" />
              Export CSV
            </ActionButton>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Rapports validés chef" value={fullyApproved.length} valueColorVar="#4f46e5" />
        <MetricCard label="Rapports en attente chef" value={pendingChefApproval.length} valueColorVar="#b45309" />
        <MetricCard label="Taux validation chef" value={`${validationRate}%`} valueColorVar="#059669" />
      </div>

      <SectionCard title="Rapports validés (comptable + chef)" icon={FileBarChart2} noPad>
        {fullyApproved.length === 0 ? (
          <EmptyState message="Aucun rapport entièrement validé." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Guichetier</th>
                  <th className={table.th}>Code</th>
                  <th className={table.th}>Début</th>
                  <th className={table.th}>Fin</th>
                  <th className={table.th}>Validé compta</th>
                  <th className={table.th}>Approuvé chef</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {fullyApproved.map((s) => (
                  <tr key={s.id} className={tableRowClassName()}>
                    <td className={table.td}>{s.userName ?? s.userId}</td>
                    <td className={table.td}>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{s.userCode ?? "—"}</code>
                    </td>
                    <td className={table.td}>{s.startTime?.toDate ? format(s.startTime.toDate(), "dd/MM HH:mm") : "—"}</td>
                    <td className={table.td}>{s.endTime?.toDate ? format(s.endTime.toDate(), "dd/MM HH:mm") : "—"}</td>
                    <td className={table.td}><StatusBadge status="success">{s.comptable?.by?.name ?? "Oui"}</StatusBadge></td>
                    <td className={table.td}><StatusBadge status="success">{s.chef?.by?.name ?? "Oui"}</StatusBadge></td>
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
