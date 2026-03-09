import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebaseConfig";
import { SectionCard, MetricCard } from "@/ui";
import { BarChart3, Building2, CalendarDays, PieChart } from "lucide-react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Timestamp,
} from "firebase/firestore";

type ExpenseRow = {
  id: string;
  category?: string;
  expenseCategory?: string;
  agencyId?: string | null;
  amount?: number;
  status?: string;
  createdAt?: Timestamp | null;
};

const CHART_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EF4444",
  "#06B6D4",
  "#84CC16",
  "#EC4899",
];

function monthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

export default function ExpenseDashboard() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const formatCurrency = useFormatCurrency();

  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [agenciesById, setAgenciesById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "expenses"),
      orderBy("createdAt", "desc"),
      limit(3000),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((d) => ({ ...(d.data() as ExpenseRow), id: d.id }));
        setRows(next);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Erreur de chargement des dépenses.");
      },
    );

    return () => unsub();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "companies", companyId, "agences"));
        const map: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { nomAgence?: string; nom?: string; ville?: string };
          map[d.id] = data.nomAgence ?? data.nom ?? data.ville ?? d.id;
        });
        setAgenciesById(map);
      } catch {
        setAgenciesById({});
      }
    })();
  }, [companyId]);

  const acceptedRows = useMemo(
    () => rows.filter((r) => String(r.status ?? "").toLowerCase() !== "rejected"),
    [rows],
  );

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    acceptedRows.forEach((r) => {
      const key = String(r.expenseCategory ?? r.category ?? "other").trim() || "other";
      const amount = Number(r.amount ?? 0);
      map.set(key, (map.get(key) ?? 0) + amount);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [acceptedRows]);

  const agencyData = useMemo(() => {
    const map = new Map<string, number>();
    acceptedRows.forEach((r) => {
      const agencyId = String(r.agencyId ?? "company");
      const name = agencyId === "company" ? "Compagnie" : agenciesById[agencyId] ?? agencyId;
      const amount = Number(r.amount ?? 0);
      map.set(name, (map.get(name) ?? 0) + amount);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [acceptedRows, agenciesById]);

  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>();
    acceptedRows.forEach((r) => {
      const created = r.createdAt?.toDate?.();
      if (!created) return;
      const key = monthKey(created);
      map.set(key, (map.get(key) ?? 0) + Number(r.amount ?? 0));
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, value]) => ({ month, label: monthLabel(month), value }));
  }, [acceptedRows]);

  const totalExpenses = useMemo(
    () => acceptedRows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    [acceptedRows],
  );

  const avgMonthly = useMemo(() => {
    if (monthlyTrend.length === 0) return 0;
    return totalExpenses / monthlyTrend.length;
  }, [monthlyTrend, totalExpenses]);

  if (loading) {
    return <div className="py-10 text-center text-gray-500">Chargement des analytics dépenses...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Dépenses totales" value={formatCurrency(totalExpenses)} icon={BarChart3} />
        <MetricCard label="Nombre de dépenses" value={acceptedRows.length} icon={PieChart} />
        <MetricCard label="Moyenne mensuelle" value={formatCurrency(avgMonthly)} icon={CalendarDays} />
      </div>

      <SectionCard title="Dépenses par catégorie" icon={PieChart}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <RePieChart>
              <Pie
                data={categoryData}
                dataKey="value"
                nameKey="name"
                outerRadius={110}
                label={(entry) => entry.name}
              >
                {categoryData.map((_, i) => (
                  <Cell key={`cat-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
            </RePieChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Dépenses par agence" icon={Building2}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agencyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Tendance mensuelle des dépenses" icon={CalendarDays}>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Line type="monotone" dataKey="value" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}
