// ✅ src/pages/CompagnieFinancesPage.tsx — version modernisée

import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiRefreshCw, FiCalendar, FiTrendingUp, FiDollarSign, FiArrowRight } from 'react-icons/fi';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface AgencyFinance {
  id: string;
  nom: string;
  totalRevenue: number;
  totalReservations: number;
}

const CompagnieFinancesPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string>('');

  const [agencyStats, setAgencyStats] = useState<AgencyFinance[]>([]);
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().setDate(new Date().getDate() - 30)),
    new Date()
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCompanyName = useCallback(async () => {
    if (!user?.companyId) return;
    const snap = await getDocs(query(collection(db, 'companies'), where('id', '==', user.companyId)));
    if (!snap.empty) {
      const data = snap.docs[0].data();
      setCompanyName(data.nom || '');
    }
  }, [user?.companyId]);

  const loadFinanceData = useCallback(async () => {
    if (!user?.companyId) return;

    setLoading(true);
    setError(null);

    try {
      const start = new Date(dateRange[0]);
      start.setHours(0, 0, 0, 0);

      const end = new Date(dateRange[1]);
      end.setHours(23, 59, 59, 999);

      const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
      const snap = await getDocs(q);
      const stats: AgencyFinance[] = [];

      for (const docSnap of snap.docs) {
        const agencyId = docSnap.id;
        const nom = docSnap.data().nom || docSnap.data().ville || 'Agence';

        const resQ = query(
          collection(db, 'reservations'),
          where('agencyId', '==', agencyId),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end)),
          where('statut', '==', 'payé')
        );

        const resSnap = await getDocs(resQ);
        const totalReservations = resSnap.size;
        const totalRevenue = resSnap.docs.reduce((sum, d) => sum + (d.data().montant || 0), 0);

        stats.push({ id: agencyId, nom, totalRevenue, totalReservations });
      }

      setAgencyStats(stats);
    } catch (err) {
      console.error(err);
      setError('Erreur lors du chargement des données financières.');
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, dateRange]);

  useEffect(() => {
    fetchCompanyName();
    loadFinanceData();
  }, [fetchCompanyName, loadFinanceData]);

  const handleDateChange = (update: [Date | null, Date | null]) => {
    const [start, end] = update;
    if (start && end) {
      setDateRange([start, end]);
    }
  };

  const totalRevenue = agencyStats.reduce((sum, a) => sum + a.totalRevenue, 0);
  const totalReservations = agencyStats.reduce((sum, a) => sum + a.totalReservations, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">📊 Finances de {companyName || 'la compagnie'}</h1>
            <p className="text-gray-500 text-sm">Sur la période sélectionnée</p>
          </div>
          <button
            onClick={loadFinanceData}
            disabled={loading}
            className={`flex items-center px-4 py-2 rounded-lg text-white shadow ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-yellow-500 hover:bg-yellow-600'
            } transition-all`}
          >
            <FiRefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Chargement...' : 'Actualiser'}
          </button>
        </div>

        {/* Filtres */}
        <div className="bg-white p-6 rounded-lg border shadow-sm flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1">
            <label className="text-sm text-gray-600 mb-1 block">
              <FiCalendar className="inline mr-2" />
              Sélectionner une période
            </label>
            <DatePicker
              selectsRange
              startDate={dateRange[0]}
              endDate={dateRange[1]}
              onChange={handleDateChange}
              className="w-full border p-2 rounded-lg shadow-sm"
              dateFormat="dd/MM/yyyy"
              isClearable
            />
          </div>
          <div className="text-sm text-gray-500 mt-2 md:mt-0">
            {dateRange[0] && dateRange[1] && (
              <span>
                Du {dateRange[0].toLocaleDateString('fr-FR')} au {dateRange[1].toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>
        </div>

        {/* Statistiques globales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg border-l-4 border-yellow-500 shadow-sm">
            <div className="flex items-center">
              <FiDollarSign className="text-yellow-500 mr-3 text-2xl" />
              <div>
                <p className="text-sm text-gray-500">Recettes totales</p>
                <p className="text-2xl font-bold">{totalRevenue.toLocaleString('fr-FR')} FCFA</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-lg border-l-4 border-blue-500 shadow-sm">
            <div className="flex items-center">
              <FiTrendingUp className="text-blue-500 mr-3 text-2xl" />
              <div>
                <p className="text-sm text-gray-500">Réservations totales</p>
                <p className="text-2xl font-bold">{totalReservations}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Liste des agences */}
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-lg font-bold mb-4">📍 Répartition par agence</h2>
          {error && <p className="text-red-500 mb-4">{error}</p>}
          {agencyStats.length === 0 ? (
            <p className="text-gray-500">Aucune donnée pour cette période.</p>
          ) : (
            <table className="w-full border text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border p-2 text-left">Agence</th>
                  <th className="border p-2 text-left">Réservations</th>
                  <th className="border p-2 text-left">Recettes</th>
                  <th className="border p-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {agencyStats.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="border p-2">{a.nom}</td>
                    <td className="border p-2">{a.totalReservations}</td>
                    <td className="border p-2">{a.totalRevenue.toLocaleString('fr-FR')} FCFA</td>
                    <td className="border p-2">
                      <button
                        onClick={() => navigate(`/compagnie/agence/${a.id}/reservations`)}
                        className="text-blue-600 hover:underline flex items-center"
                      >
                        Voir détail <FiArrowRight className="ml-1" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompagnieFinancesPage;
