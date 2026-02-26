// Phase 5 — Company-level consolidated finances (CEO + company_accountant). Not agency accounting.
import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { DollarSign, AlertTriangle, Building2, Download } from "lucide-react";
import { useCapabilities } from "@/core/hooks/useCapabilities";
import AccessDenied from "@/core/ui/AccessDenied";

const SHIFT_REPORTS_COLLECTION = "shiftReports";

type DailyStatsDoc = {
  companyId?: string;
  agencyId?: string;
  date?: string;
  totalRevenue?: number;
  totalPassengers?: number;
  validatedSessions?: number;
};

type ShiftReportDoc = {
  shiftId?: string;
  agencyId?: string;
  status?: string;
  totalRevenue?: number;
  montant?: number;
  validationAudit?: { computedDifference?: number; validatedAt?: unknown };
  startAt?: { toDate?: () => Date };
};

function toDateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export default function CompanyFinancesPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const { setHeader, resetHeader } = usePageHeader();
  const { hasCapability, loading: capLoading } = useCapabilities();

  const [dailyStats, setDailyStats] = useState<DailyStatsDoc[]>([]);
  const [discrepancies, setDiscrepancies] = useState<ShiftReportDoc[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHeader({ title: "Finances compagnie" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const today = toDateKey(new Date());
    const weekStart = toDateKey(subDays(new Date(), 6));
    const monthStart = toDateKey(subDays(new Date(), 29));

    (async () => {
      setLoading(true);
      try {
        const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        const ags = agencesSnap.docs.map((d) => ({
          id: d.id,
          nom: (d.data() as { nom?: string }).nom ?? d.id,
        }));
        setAgencies(ags);

        const qDaily = query(
          collectionGroup(db, "dailyStats"),
          where("companyId", "==", companyId),
          where("date", ">=", monthStart),
          where("date", "<=", today),
          limit(500)
        );
        const dailySnap = await getDocs(qDaily);
        setDailyStats(dailySnap.docs.map((d) => d.data() as DailyStatsDoc));

        const disc: ShiftReportDoc[] = [];
        for (const a of ags.slice(0, 30)) {
          const ref = collection(db, "companies", companyId, "agences", a.id, SHIFT_REPORTS_COLLECTION);
          const q = query(
            ref,
            where("status", "==", "validated"),
            limit(20)
          );
          try {
            const snap = await getDocs(q);
            snap.docs.forEach((d) => {
              const data = d.data() as ShiftReportDoc;
              const diff = data.validationAudit?.computedDifference ?? 0;
              if (diff !== 0) {
                disc.push({ ...data, agencyId: a.id });
              }
            });
          } catch {
            const alt = query(ref, where("status", "==", "validated"), limit(20));
            const snap = await getDocs(alt);
            snap.docs.forEach((d) => {
              const data = d.data() as ShiftReportDoc;
              const diff = data.validationAudit?.computedDifference ?? 0;
              if (diff !== 0) {
                disc.push({ ...data, agencyId: a.id });
              }
            });
          }
        }
        setDiscrepancies(disc);
      } catch (e) {
        console.error("CompanyFinances load:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const agencyNames = useMemo(() => new Map(agencies.map((a) => [a.id, a.nom])), [agencies]);

  const revenueToday = useMemo(() => {
    const today = toDateKey(new Date());
    return dailyStats
      .filter((d) => d.date === today)
      .reduce((s, d) => s + (Number(d.totalRevenue) || 0), 0);
  }, [dailyStats]);

  const revenueWeek = useMemo(() => {
    const today = new Date();
    const weekStart = subDays(today, 6);
    return dailyStats
      .filter((d) => {
        if (!d.date) return false;
        const dt = new Date(d.date);
        return dt >= startOfDay(weekStart) && dt <= endOfDay(today);
      })
      .reduce((s, d) => s + (Number(d.totalRevenue) || 0), 0);
  }, [dailyStats]);

  const revenueMonth = useMemo(() => {
    return dailyStats.reduce((s, d) => s + (Number(d.totalRevenue) || 0), 0);
  }, [dailyStats]);

  const byAgency = useMemo(() => {
    const today = toDateKey(new Date());
    const map = new Map<string, { today: number; week: number; month: number }>();
    dailyStats.forEach((d) => {
      const aid = d.agencyId ?? "";
      if (!aid) return;
      const cur = map.get(aid) ?? { today: 0, week: 0, month: 0 };
      const rev = Number(d.totalRevenue) || 0;
      cur.month += rev;
      if (d.date === today) cur.today += rev;
      const dDate = d.date ? new Date(d.date) : null;
      if (dDate && dDate >= subDays(new Date(), 6)) cur.week += rev;
      map.set(aid, cur);
    });
    return Array.from(map.entries()).map(([agencyId, v]) => ({
      agencyId,
      nom: agencyNames.get(agencyId) ?? agencyId,
      ...v,
    }));
  }, [dailyStats, agencyNames]);

  const filteredDiscrepancies = useMemo(() => {
    if (!agencyFilter) return discrepancies;
    return discrepancies.filter((d) => d.agencyId === agencyFilter);
  }, [discrepancies, agencyFilter]);

  const exportCsv = () => {
    const rows = [
      ["Agence", "Shift ID", "Écart (reçu - attendu)", "Date"].join(";"),
      ...filteredDiscrepancies.map((d) =>
        [
          agencyNames.get(d.agencyId ?? "") ?? d.agencyId,
          d.shiftId ?? "",
          (d.validationAudit?.computedDifference ?? 0).toString(),
          d.validationAudit?.validatedAt ? String(d.validationAudit.validatedAt) : "",
        ].join(";")
      ),
    ];
    const blob = new Blob(["\ufeff" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecarts-comptables-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (capLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Chargement…</div>
      </div>
    );
  }

  if (!hasCapability("manage_company_finances")) {
    return <AccessDenied capability="manage_company_finances" />;
  }

  if (!companyId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Compagnie introuvable.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      {/* Consolidated Revenue */}
      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5" /> Revenus consolidés (sessions validées)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-indigo-50 border border-indigo-100">
            <div className="text-2xl font-bold text-indigo-700">{revenueToday.toLocaleString("fr-FR")}</div>
            <div className="text-sm text-indigo-800">Aujourd&apos;hui</div>
          </div>
          <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
            <div className="text-2xl font-bold text-purple-700">{revenueWeek.toLocaleString("fr-FR")}</div>
            <div className="text-sm text-purple-800">7 derniers jours</div>
          </div>
          <div className="p-4 rounded-lg bg-teal-50 border border-teal-100">
            <div className="text-2xl font-bold text-teal-700">{revenueMonth.toLocaleString("fr-FR")}</div>
            <div className="text-sm text-teal-800">30 derniers jours</div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Agence</th>
                <th className="text-right py-2">Aujourd&apos;hui</th>
                <th className="text-right py-2">7 jours</th>
                <th className="text-right py-2">30 jours</th>
              </tr>
            </thead>
            <tbody>
              {byAgency.map((a) => (
                <tr key={a.agencyId} className="border-b">
                  <td className="py-2">{a.nom}</td>
                  <td className="py-2 text-right">{a.today.toLocaleString("fr-FR")}</td>
                  <td className="py-2 text-right">{a.week.toLocaleString("fr-FR")}</td>
                  <td className="py-2 text-right">{a.month.toLocaleString("fr-FR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Discrepancy Monitoring */}
      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Écarts comptables (computedDifference ≠ 0)
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
          >
            <option value="">Toutes les agences</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.nom}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            <Download className="w-4 h-4" /> Exporter CSV
          </button>
        </div>
        {filteredDiscrepancies.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun écart enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Agence</th>
                  <th className="text-left py-2">Shift</th>
                  <th className="text-right py-2">Écart</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiscrepancies.map((d, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2">{agencyNames.get(d.agencyId ?? "") ?? d.agencyId}</td>
                    <td className="py-2">{d.shiftId ?? "—"}</td>
                    <td className="py-2 text-right">
                      {(d.validationAudit?.computedDifference ?? 0) >= 0 ? "+" : ""}
                      {(d.validationAudit?.computedDifference ?? 0).toLocaleString("fr-FR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500">
        Accès : CEO (admin_compagnie) et comptable compagnie (company_accountant). Aucune validation ni modification des sessions depuis cette page.
      </p>
    </div>
  );
}
