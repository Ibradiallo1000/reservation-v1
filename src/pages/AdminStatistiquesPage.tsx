import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  collectionGroup,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
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
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  /* =======================
     Fetch data (ADMIN)
  ======================= */
  useEffect(() => {
    const fetchData = async () => {
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
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
    return <div className="p-6">Chargement des statistiques…</div>;
  }

  /* =======================
     Render
  ======================= */
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Statistiques générales
      </h1>

      {/* Résumé */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
        <StatBox label="Réservations" value={totalReservations} color="text-blue-600" />
        <StatBox
          label="Revenus totaux"
          value={`${totalRevenue.toLocaleString()} FCFA`}
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
            <Tooltip />
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
            <Tooltip />
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
  <div className="bg-white rounded shadow p-4 text-center">
    <h2 className="text-lg font-semibold">{label}</h2>
    <p className={`text-3xl font-bold ${color}`}>{value}</p>
  </div>
);

const Section = ({ title, children }: any) => (
  <div className="mb-10">
    <h2 className="text-lg font-semibold mb-2">{title}</h2>
    {children}
  </div>
);

export default AdminStatistiquesPage;
