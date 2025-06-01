import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

interface MonthlyStats {
  month: string;
  totalReservations: number;
  totalPassagers: number;
  totalMontant: number;
}

const CompagnieStatistiquesMensuellesPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<MonthlyStats[]>([]);
  const [loading, setLoading] = useState(true);

  const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.companyId) return;

      const resQuery = query(
        collection(db, 'reservations'),
        where('compagnieId', '==', user.companyId),
        where('statut', '==', 'payé')
      );
      const resSnap = await getDocs(resQuery);

      const grouped: Record<string, MonthlyStats> = {};

      resSnap.docs.forEach((doc) => {
        const data = doc.data();
        const date = data.createdAt?.toDate?.();
        if (!date) return;

        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = `${mois[date.getMonth()]} ${date.getFullYear()}`;

        if (!grouped[monthKey]) {
          grouped[monthKey] = {
            month: label,
            totalReservations: 0,
            totalPassagers: 0,
            totalMontant: 0,
          };
        }

        grouped[monthKey].totalReservations += 1;
        grouped[monthKey].totalPassagers += data.seatsGo || 1;
        grouped[monthKey].totalMontant += data.montant || 0;
      });

      const result = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, value]) => value);

      setStats(result);
      setLoading(false);
    };

    fetchStats();
  }, [user]);

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📅 Statistiques mensuelles</h1>

      {loading ? (
        <p>Chargement des données...</p>
      ) : (
        <>
          <table className="w-full border text-sm mb-8">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-3 py-2">Mois</th>
                <th className="border px-3 py-2">Réservations</th>
                <th className="border px-3 py-2">Passagers</th>
                <th className="border px-3 py-2">Montant encaissé (FCFA)</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s, i) => (
                <tr key={i} className="text-center">
                  <td className="border px-3 py-2">{s.month}</td>
                  <td className="border px-3 py-2">{s.totalReservations}</td>
                  <td className="border px-3 py-2">{s.totalPassagers}</td>
                  <td className="border px-3 py-2 text-green-600 font-semibold">{s.totalMontant.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bg-white shadow p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">📊 Graphique des revenus par mois</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="totalMontant" fill="#34d399" name="Montant encaissé" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

export default CompagnieStatistiquesMensuellesPage;
