/**
 * @deprecated Phase 1 – Cette page mélange métriques SaaS et opérationnelles par compagnie.
 * Utiliser le tableau de bord admin pour les indicateurs plateforme.
 * Page conservée pour compatibilité.
 */
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  collection,
  collectionGroup,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { format } from "date-fns";
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";

/* =======================
   Types
======================= */
type Reservation = {
  total?: number;
  createdAt?: Timestamp;
  companyName?: string;
};

type Company = {
  status?: string;
};

/* =======================
   Component
======================= */
const AdminStatistiquesPage: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /* =======================
     Fetch data (ADMIN)
  ======================= */
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // ✅ Toutes les réservations (collectionGroup)
        const resSnap = await getDocs(
          collectionGroup(db, "reservations")
        );
        const resData = resSnap.docs.map(d => d.data() as Reservation);

        // ✅ Toutes les compagnies
        const compSnap = await getDocs(
          collection(db, "companies")
        );
        const compData = compSnap.docs.map(d => d.data() as Company);

        setReservations(resData);
        setCompanies(compData);
      } catch (err) {
        console.error("AdminStatistiquesPage error:", err);
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger les statistiques."
            : "Erreur lors du chargement des statistiques."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isOnline, reloadKey]);

  /* =======================
     Stats globales
  ======================= */
  const totalReservations = reservations.length;

  const totalRevenue = useMemo(
    () => reservations.reduce((sum, r) => sum + (r.total || 0), 0),
    [reservations]
  );

  const activeCompanies = useMemo(
    () => companies.filter(c => c.status === "actif").length,
    [companies]
  );

  /* =======================
     Stats mensuelles
  ======================= */
  const monthlyData = useMemo(() => {
    const map: Record<string, number> = {};

    reservations.forEach(r => {
      if (!r.createdAt) return;
      const date = r.createdAt.toDate();
      const key = format(date, "yyyy-MM");
      map[key] = (map[key] || 0) + (r.total || 0);
    });

    return Object.entries(map)
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [reservations]);

  /* =======================
     Top compagnies
  ======================= */
  const topCompanies = useMemo(() => {
    const map: Record<string, number> = {};

    reservations.forEach(r => {
      const name = r.companyName || "Inconnue";
      map[name] = (map[name] || 0) + (r.total || 0);
    });

    return Object.entries(map)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [reservations]);

  if (loading) {
    return <PageLoadingState />;
  }

  /* =======================
     Render
  ======================= */
  return (
    <div className="p-6">
      {!isOnline && (
        <div className="mb-4">
          <PageOfflineState message="Connexion instable: les statistiques peuvent être incomplètes." />
        </div>
      )}
      {error && (
        <div className="mb-4">
          <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
        </div>
      )}
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800">Page dépréciée</p>
          <p className="text-sm text-amber-700 mt-1">
            Cette page mélange métriques SaaS et opérationnelles par compagnie. Les indicateurs
            plateforme (anonymisés) sont disponibles sur le tableau de bord admin.
          </p>
        </div>
      </div>
      <h1 className="text-2xl font-bold mb-6">
        Statistiques générales
      </h1>

      {/* Résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <StatBox label="Réservations" value={totalReservations} color="text-blue-600" />
        <StatBox
          label="Revenus totaux"
          value={formatCurrency(totalRevenue)}
          color="text-green-600"
        />
        <StatBox
          label="Compagnies actives"
          value={activeCompanies}
          color="text-indigo-600"
        />
      </div>

      {/* Évolution mensuelle */}
      <Section title="Évolution des revenus par mois">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value: number) => [formatCurrency(value), "Revenus"]} />
            <Legend />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#10B981"
              name="Revenus"
            />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* Top compagnies */}
      <Section title="Top 5 compagnies par revenus">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={topCompanies}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip formatter={(value: number) => [formatCurrency(value), "CA total"]} />
            <Legend />
            <Bar dataKey="total" fill="#6366F1" name="CA total" />
          </BarChart>
        </ResponsiveContainer>
      </Section>
    </div>
  );
};

/* =======================
   UI helpers
======================= */
const StatBox = ({ label, value, color }: any) => (
  <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
    <h2 className="text-lg font-semibold">{label}</h2>
    <p className={`text-2xl font-bold ${color}`}>{value}</p>
  </div>
);

const Section = ({ title, children }: any) => (
  <div className="mb-10">
    <h2 className="text-lg font-semibold mb-2">{title}</h2>
    {children}
  </div>
);

export default AdminStatistiquesPage;
