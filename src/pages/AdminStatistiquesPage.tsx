import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
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
} from 'recharts';
import { format } from 'date-fns';

const AdminStatistiquesPage: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [compagnies, setCompagnies] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const resSnapshot = await getDocs(collection(db, 'reservations'));
      const compSnapshot = await getDocs(collection(db, 'compagnies'));
      setReservations(resSnapshot.docs.map(doc => doc.data()));
      setCompagnies(compSnapshot.docs.map(doc => doc.data()));
    };
    fetchData();
  }, []);

  // Statistiques de base
  const totalReservations = reservations.length;
  const totalRevenue = reservations.reduce((sum, r) => sum + (r.total || 0), 0);
  const activeCompanies = compagnies.filter(c => c.status === 'actif').length;

  // Statistiques mensuelles (répartition par mois)
  const monthlyStats: Record<string, { total: number }> = {};
  reservations.forEach(r => {
    const date = r.createdAt?.toDate?.() || new Date();
    const month = format(date, 'yyyy-MM');
    if (!monthlyStats[month]) {
      monthlyStats[month] = { total: 0 };
    }
    monthlyStats[month].total += r.total || 0;
  });

  const monthlyData = Object.entries(monthlyStats).map(([month, data]) => ({
    month,
    total: data.total,
  })).sort((a, b) => a.month.localeCompare(b.month));

  // Top compagnies par CA
  const companyStats: Record<string, number> = {};
  reservations.forEach(r => {
    const company = r.trip?.company || 'Inconnue';
    companyStats[company] = (companyStats[company] || 0) + (r.total || 0);
  });

  const topCompanies = Object.entries(companyStats)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Statistiques générales</h1>

      {/* Résumé chiffres clés */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded shadow p-4 text-center">
          <h2 className="text-xl font-semibold">Réservations</h2>
          <p className="text-3xl font-bold text-blue-600">{totalReservations}</p>
        </div>
        <div className="bg-white rounded shadow p-4 text-center">
          <h2 className="text-xl font-semibold">Revenus totaux</h2>
          <p className="text-3xl font-bold text-green-600">{totalRevenue.toLocaleString()} FCFA</p>
        </div>
        <div className="bg-white rounded shadow p-4 text-center">
          <h2 className="text-xl font-semibold">Compagnies actives</h2>
          <p className="text-3xl font-bold text-indigo-600">{activeCompanies}</p>
        </div>
      </div>

      {/* Graphique évolution mensuelle */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold mb-2">Évolution des revenus par mois</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={monthlyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="total" stroke="#10B981" name="Revenus" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top compagnies */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Top 5 compagnies par revenus</h2>
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
      </div>
    </div>
  );
};

export default AdminStatistiquesPage;
