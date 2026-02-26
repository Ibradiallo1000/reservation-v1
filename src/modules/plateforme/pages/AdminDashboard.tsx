// src/modules/plateforme/pages/AdminDashboard.tsx
// Phase 1 – Teliya SaaS: métriques plateforme uniquement + macro agrégées anonymisées
import React, { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Building2,
  Users,
  DollarSign,
  BarChart2,
  CreditCard,
  Globe,
  Download,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { formatCurrency, getCurrencySymbol } from "@/shared/utils/formatCurrency";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  YAxis,
  XAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ==== Types ==== */
interface Company {
  id: string;
  nom?: string;
  slug?: string;
  plan?: string;
  planId?: string;
  status?: string;
  pays?: string;
  createdAt?: { seconds: number };
}

interface PlanDoc {
  id: string;
  name: string;
  priceMonthly: number;
}

interface Reservation {
  montant?: number;
  total?: number;
  commission?: number;
  companyId?: string;
  createdAt?: { seconds: number };
}

/* ==== Utils ==== */
const nf = new Intl.NumberFormat("fr-FR");
const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => {
  const t = new Date(d);
  t.setDate(t.getDate() + n);
  return t;
};

const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();

  const [periode, setPeriode] = useState<"7j" | "30j">("30j");
  const [loading, setLoading] = useState(true);

  // SaaS metrics
  const [totalActiveCompanies, setTotalActiveCompanies] = useState(0);
  const [newCompanies30d, setNewCompanies30d] = useState(0);
  const [activeSubscriptions, setActiveSubscriptions] = useState(0);
  const [mrr, setMrr] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);

  // Macro aggregated (anonymized)
  const [globalGmv, setGlobalGmv] = useState(0);
  const [totalReservations, setTotalReservations] = useState(0);
  const [monthlyGrowthRate, setMonthlyGrowthRate] = useState<number | null>(null);
  const [countryDistribution, setCountryDistribution] = useState<
    { name: string; value: number }[]
  >([]);
  const [series, setSeries] = useState<
    { date: string; gmv: number; reservations: number }[]
  >([]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);

      const now = new Date();
      const start30d = addDays(now, -29);
      const startPrevMonth = addDays(now, -59);

      // Companies
      const companiesSnap = await getDocs(collection(db, "companies"));
      const comps: Company[] = companiesSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          nom: d.nom || "",
          plan: d.plan || "free",
          planId: d.planId,
          status: d.status || "actif",
          pays: d.pays || "Non défini",
          createdAt: d.createdAt,
        };
      });

      const active = comps.filter((c) => c.status === "actif");
      const newIn30d = comps.filter((c) => {
        const sec = c.createdAt?.seconds;
        if (!sec) return false;
        const created = new Date(sec * 1000);
        return created >= start30d;
      });

      // Plans for MRR and active subscriptions
      const plansSnap = await getDocs(collection(db, "plans"));
      const plansById: Record<string, PlanDoc> = {};
      plansSnap.docs.forEach((d) => {
        const x = d.data();
        plansById[d.id] = {
          id: d.id,
          name: x.name ?? x.nom ?? "",
          priceMonthly: Number(x.priceMonthly) || 0,
        };
      });

      const paidPlans = new Set(
        Object.entries(plansById)
          .filter(([, p]) => p.priceMonthly > 0)
          .map(([id]) => id)
      );

      let mrrSum = 0;
      let activeSubs = 0;
      active.forEach((c) => {
        const planId = c.planId || "";
        const plan = plansById[planId];
        if (plan && paidPlans.has(planId)) {
          activeSubs++;
          mrrSum += plan.priceMonthly;
        }
      });

      setTotalActiveCompanies(active.length);
      setNewCompanies30d(newIn30d.length);
      setActiveSubscriptions(activeSubs);
      setMrr(mrrSum);

      // Reservations (collectionGroup) – global only, no per-company
      const resSnap = await getDocs(collectionGroup(db, "reservations"));
      let gmv = 0;
      let commission = 0;
      let reservations = 0;

      const dailyCurr = new Map<string, { gmv: number; reservations: number }>();
      const dailyPrev = new Map<string, { gmv: number; reservations: number }>();
      const countryAgg: Record<string, number> = {};

      const companyIdToCountry: Record<string, string> = {};
      comps.forEach((c) => {
        companyIdToCountry[c.id] = c.pays || "Non défini";
      });

      for (const docSnap of resSnap.docs) {
        const d = docSnap.data() as Reservation;
        const montant = toNum(d.total ?? d.montant);
        const comm = toNum(d.commission);
        const companyId = d.companyId || "";
        const country = companyIdToCountry[companyId] || "Non défini";
        const createdMs = d.createdAt?.seconds ? d.createdAt.seconds * 1000 : null;

        if (!createdMs) continue;

        const created = new Date(createdMs);
        const inRange = created >= start30d && created <= now;
        const inPrevRange =
          created >= startPrevMonth && created < start30d;

        if (inRange) {
          gmv += montant;
          commission += comm;
          reservations++;

          const k = dayKey(created);
          const cur = dailyCurr.get(k) ?? { gmv: 0, reservations: 0 };
          cur.gmv += montant;
          cur.reservations += 1;
          dailyCurr.set(k, cur);

          countryAgg[country] = (countryAgg[country] || 0) + montant;
        }

        if (inPrevRange) {
          const k = dayKey(created);
          const cur = dailyPrev.get(k) ?? { gmv: 0, reservations: 0 };
          cur.gmv += montant;
          cur.reservations += 1;
          dailyPrev.set(k, cur);
        }
      }

      setTotalCommission(commission);
      setGlobalGmv(gmv);
      setTotalReservations(reservations);

      // Monthly growth: compare last 30d vs previous 30d
      const currTotal = gmv;
      let prevTotal = 0;
      dailyPrev.forEach((v) => (prevTotal += v.gmv));
      const growth =
        prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
      setMonthlyGrowthRate(growth);

      // Series for trends (last N days)
      const start = periode === "7j" ? addDays(now, -6) : start30d;
      const range: { date: string; gmv: number; reservations: number }[] = [];
      let cur = new Date(start);
      while (cur <= now) {
        const k = dayKey(cur);
        const v = dailyCurr.get(k) ?? { gmv: 0, reservations: 0 };
        range.push({ date: k, ...v });
        cur = addDays(cur, 1);
      }
      setSeries(range);

      // Country distribution (anonymized, aggregated)
      const dist = Object.entries(countryAgg).map(([name, value]) => ({
        name,
        value,
      }));
      setCountryDistribution(dist);

      setLoading(false);
    };
    run();
  }, [periode]);

  const kpis = useMemo(
    () => [
      {
        label: "Compagnies actives",
        value: nf.format(totalActiveCompanies),
        icon: Building2,
        color: "text-purple-600",
        to: "/admin/compagnies",
      },
      {
        label: "Nouvelles (30j)",
        value: nf.format(newCompanies30d),
        icon: TrendingUp,
        color: "text-emerald-600",
        to: "/admin/compagnies",
      },
      {
        label: "Abonnements actifs",
        value: nf.format(activeSubscriptions),
        icon: CreditCard,
        color: "text-blue-600",
        to: "/admin/plans",
      },
      {
        label: "MRR",
        value: formatCurrency(mrr),
        icon: DollarSign,
        color: "text-green-600",
        to: "/admin/finances",
      },
      {
        label: "Commission totale",
        value: formatCurrency(totalCommission),
        icon: BarChart2,
        color: "text-orange-600",
        to: "/admin/finances",
      },
      {
        label: "GMV global",
        value: formatCurrency(globalGmv),
        icon: DollarSign,
        color: "text-slate-600",
        to: undefined,
      },
      {
        label: "Réservations totales",
        value: nf.format(totalReservations),
        icon: Users,
        color: "text-indigo-600",
        to: undefined,
      },
      {
        label: "Croissance mensuelle",
        value:
          monthlyGrowthRate !== null
            ? `${monthlyGrowthRate >= 0 ? "+" : ""}${monthlyGrowthRate.toFixed(1)}%`
            : "—",
        icon: TrendingUp,
        color:
          monthlyGrowthRate !== null && monthlyGrowthRate >= 0
            ? "text-green-600"
            : "text-red-600",
        to: undefined,
      },
    ],
    [
      totalActiveCompanies,
      newCompanies30d,
      activeSubscriptions,
      mrr,
      totalCommission,
      globalGmv,
      totalReservations,
      monthlyGrowthRate,
    ]
  );

  const handleExportCSV = () => {
    const rows: string[] = [];
    rows.push("=== Métriques SaaS (Teliya) ===");
    rows.push(`Compagnies actives;${totalActiveCompanies}`);
    rows.push(`Nouvelles (30j);${newCompanies30d}`);
    rows.push(`Abonnements actifs;${activeSubscriptions}`);
    rows.push(`MRR (${getCurrencySymbol()});${mrr}`);
    rows.push(`Commission totale (${getCurrencySymbol()});${totalCommission}`);
    rows.push("");
    rows.push("=== Métriques macro (anonymisées) ===");
    rows.push(`GMV global (${getCurrencySymbol()});${globalGmv}`);
    rows.push(`Réservations totales;${totalReservations}`);
    rows.push(`Croissance mensuelle (%);${monthlyGrowthRate ?? "N/A"}`);
    rows.push("");
    rows.push("=== Répartition par pays (anonymisée) ===");
    rows.push("Pays;GMV");
    countryDistribution.forEach((c) => rows.push(`${c.name};${c.value}`));
    rows.push("");
    rows.push("=== Tendances ===");
    rows.push("Date;GMV;Réservations");
    series.forEach((s) => rows.push(`${s.date};${s.gmv};${s.reservations}`));
    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "teliya_dashboard_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const COLORS = ["#ea580c", "#2563eb", "#16a34a", "#9333ea", "#0d9488"];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-gray-500">Chargement des indicateurs…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Vue d’ensemble plateforme</h2>
          <p className="text-gray-600">
            Métriques SaaS Teliya et indicateurs macro agrégés (anonymisés).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="flex gap-2">
            {(["7j", "30j"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriode(p)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                  periode === p
                    ? "bg-[var(--btn-primary,#FF6600)] text-white shadow-sm"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {p === "7j" ? "7 jours" : "30 jours"}
              </button>
            ))}
          </div>
          <Button
            onClick={handleExportCSV}
            variant="primary"
            size="sm"
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {kpis.map(({ label, value, icon: Icon, color, to }) => (
          <button
            key={label}
            onClick={() => to && navigate(to)}
            disabled={!to}
            className={`text-left bg-white p-4 rounded-xl border shadow-sm hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-orange-200 ${
              to ? "cursor-pointer hover:translate-y-[-1px]" : "cursor-default"
            }`}
          >
            <Icon className={`h-6 w-6 mb-2 ${color}`} />
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-lg font-bold">{value}</p>
          </button>
        ))}
      </div>

      {/* Tendances (macro) */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4">Tendances (macro agrégé)</h3>
        {series.length === 0 ? (
          <p className="text-gray-500 text-sm">Pas assez de données.</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="gmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="bookings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  name={`GMV (${getCurrencySymbol()})`}
                  stroke="#16a34a"
                  fill="url(#gmv)"
                />
                <Area
                  type="monotone"
                  dataKey="reservations"
                  name="Réservations"
                  stroke="#2563eb"
                  fill="url(#bookings)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Répartition par pays (anonymisée) */}
      <section className="bg-white p-6 rounded-xl shadow-sm border">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Globe className="h-5 w-5 text-gray-600" /> Répartition par pays (GMV agrégé)
        </h3>
        {countryDistribution.length === 0 ? (
          <p className="text-gray-500 text-sm">Aucune donnée par pays.</p>
        ) : (
          <div className="h-64 w-full max-w-md">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={countryDistribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {countryDistribution.map((_, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "GMV"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminDashboard;
