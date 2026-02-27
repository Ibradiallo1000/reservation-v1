// src/modules/plateforme/pages/AdminFinancesPage.tsx
// Phase 1 – Teliya SaaS: revenus plateforme uniquement (commissions + abonnements)
import React, { useEffect, useState } from "react";
import { formatCurrency, getCurrencySymbol } from "@/shared/utils/formatCurrency";
import { collection, collectionGroup, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const nf = new Intl.NumberFormat("fr-FR");

interface PlatformFinances {
  totalCommission: number;
  subscriptionRevenue: number;
  totalPlatformRevenue: number;
  commissionByMonth: { month: string; commission: number }[];
}

const AdminFinancesPage: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [data, setData] = useState<PlatformFinances>({
    totalCommission: 0,
    subscriptionRevenue: 0,
    totalPlatformRevenue: 0,
    commissionByMonth: [],
  });

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {

        // Companies + plans pour MRR
        const companiesSnap = await getDocs(collection(db, "companies"));
        const plansSnap = await getDocs(collection(db, "plans"));
        const plansById: Record<string, number> = {};
        plansSnap.docs.forEach((d) => {
          const x = d.data();
          plansById[d.id] = Number(x.priceMonthly) || 0;
        });

        let subscriptionRevenue = 0;
        companiesSnap.docs.forEach((d) => {
          const c = d.data();
          const planId = c.planId || "";
          const price = plansById[planId];
          if (price && price > 0 && c.status !== "inactif") {
            subscriptionRevenue += price;
          }
        });

        // Commissions depuis les réservations (collectionGroup, pas de détail par compagnie)
        const resSnap = await getDocs(collectionGroup(db, "reservations"));
        const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

        let totalCommission = 0;
        const monthAgg: Record<string, number> = {};

        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const defaultEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const start = startDate ? new Date(startDate) : defaultStart;
        const end = endDate ? new Date(endDate) : defaultEnd;

        resSnap.docs.forEach((docSnap) => {
          const r = docSnap.data();
          const comm = toNum(r.commission);
          const created = r.createdAt?.toDate?.() ?? (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null);
          if (!created || created < start || created > end) return;

          totalCommission += comm;
          const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}`;
          monthAgg[key] = (monthAgg[key] || 0) + comm;
        });

        const commissionByMonth = Object.entries(monthAgg)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, commission]) => ({
            month,
            commission,
          }));

        setData({
          totalCommission,
          subscriptionRevenue,
          totalPlatformRevenue: totalCommission + subscriptionRevenue,
          commissionByMonth,
        });
      } catch (e) {
        console.error(e);
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger les finances."
            : "Erreur lors du chargement des finances."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [startDate, endDate, isOnline, reloadKey]);

  if (loading) {
    return <PageLoadingState />;
  }

  return (
    <div className="p-6 space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: les chiffres peuvent être incomplets." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <h1 className="text-2xl font-bold mb-4">Finances Teliya – Revenus plateforme</h1>
      <p className="text-gray-600 text-sm">
        Commission et revenus d&apos;abonnement uniquement. Aucun détail par compagnie.
      </p>

      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Du</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Au</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </label>
      </div>

      {/* KPIs revenus plateforme */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Commissions</p>
          <p className="text-xl font-bold text-orange-600">
            {formatCurrency(data.totalCommission)}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Revenus abonnements (MRR)</p>
          <p className="text-xl font-bold text-blue-600">
            {formatCurrency(data.subscriptionRevenue)}
          </p>
        </div>
        <div className="bg-white border rounded-xl p-4 shadow-sm">
          <p className="text-sm text-gray-500">Revenus totaux plateforme</p>
          <p className="text-xl font-bold text-green-600">
            {formatCurrency(data.totalPlatformRevenue)}
          </p>
        </div>
      </div>

      {/* Graphique commissions par mois */}
      {data.commissionByMonth.length > 0 && (
        <div className="w-full h-[350px] bg-white p-4 rounded-xl shadow-sm border">
          <h3 className="text-lg font-semibold mb-4">Commissions par mois</h3>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart
              data={data.commissionByMonth.map((d) => ({
                ...d,
                monthLabel: format(new Date(d.month + "-01"), "MMM yyyy"),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" />
              <YAxis tickFormatter={(v) => nf.format(v / 1000) + "k"} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Commission"]}
              />
              <Legend />
              <Bar dataKey="commission" fill="#ea580c" name={`Commission (${getCurrencySymbol()})`} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};

export default AdminFinancesPage;
