// ✅ src/pages/CompagnieAgencesStatistiquesPage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface AgenceStat {
  id: string;
  ville: string;
  totalReservations: number;
  totalMontant: number;
  totalPassagers: number;
}

const CompagnieAgencesStatistiquesPage: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<AgenceStat[]>([]);
  const [loading, setLoading] = useState(true);

  const getStats = async () => {
    if (!user?.companyId) return;
    setLoading(true);

    const agencesSnap = await getDocs(query(collection(db, 'agences'), where('companyId', '==', user.companyId)));
    const agences = agencesSnap.docs.map(doc => ({ id: doc.id, ville: doc.data().ville }));

    const reservationsSnap = await getDocs(query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé')));

    const grouped: Record<string, AgenceStat> = {};

    agences.forEach(ag => {
      grouped[ag.id] = { id: ag.id, ville: ag.ville, totalReservations: 0, totalMontant: 0, totalPassagers: 0 };
    });

    reservationsSnap.docs.forEach(doc => {
      const data = doc.data();
      const aid = data.agencyId;
      if (grouped[aid]) {
        grouped[aid].totalReservations += 1;
        grouped[aid].totalMontant += data.montant || 0;
        grouped[aid].totalPassagers += data.seatsGo || 1;
      }
    });

    setStats(Object.values(grouped));
    setLoading(false);
  };

  const exportCSV = () => {
    const rows = [
      ['Agence', 'Billets vendus', 'Passagers', 'Montant total (FCFA)'],
      ...stats.map(s => [s.ville, s.totalReservations, s.totalPassagers, s.totalMontant])
    ];
    const csvContent = rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'statistiques_agences.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    getStats();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Statistiques par Agence</h1>

      <div className="flex justify-end gap-2 mb-4">
        <button onClick={exportCSV} className="bg-green-600 text-white px-4 py-2 rounded text-sm">📥 Export CSV</button>
        <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">🖨️ Imprimer</button>
      </div>

      {loading ? (
        <p>Chargement...</p>
      ) : (
        <>
          <div className="overflow-x-auto mb-6">
            <table className="w-full border text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-3 py-2">Agence</th>
                  <th className="border px-3 py-2">Réservations</th>
                  <th className="border px-3 py-2">Passagers</th>
                  <th className="border px-3 py-2">Montant encaissé (FCFA)</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.id} className="text-center">
                    <td className="border px-3 py-2">{s.ville}</td>
                    <td className="border px-3 py-2">{s.totalReservations}</td>
                    <td className="border px-3 py-2">{s.totalPassagers}</td>
                    <td className="border px-3 py-2 font-semibold text-green-600">{s.totalMontant.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white shadow p-4 rounded-lg">
            <h2 className="text-lg font-semibold mb-4">Visualisation graphique</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stats} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="ville" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="totalMontant" fill="#facc15" name="Montant encaissé" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
};

export default CompagnieAgencesStatistiquesPage;
