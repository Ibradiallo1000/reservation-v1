// src/pages/DashboardCompagnie.tsx
import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';
import DateRangePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

// Types
interface Agency {
  id: string;
  nom: string;
  ville: string;
  companyId: string;
  statut?: 'active' | 'inactive';
}

interface AgencyStats extends Agency {
  reservations: number;
  revenus: number;
  courriers: number;
}

interface GlobalStats {
  totalAgencies: number;
  totalReservations: number;
  totalRevenue: number;
  totalCouriers: number;
  growthRate: number;
}

const DashboardCompagnie: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().setDate(new Date().getDate() - 30)),
    new Date()
  ]);
  const [agenciesStats, setAgenciesStats] = useState<AgencyStats[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalAgencies: 0,
    totalReservations: 0,
    totalRevenue: 0,
    totalCouriers: 0,
    growthRate: 0,
  });

  const fetchAgencies = async (companyId: string): Promise<Agency[]> => {
    const agenciesQuery = query(
      collection(db, 'agences'),
      where('companyId', '==', companyId)
    );
    const snapshot = await getDocs(agenciesQuery);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      nom: doc.data().nom,
      ville: doc.data().ville,
      companyId: doc.data().companyId,
      statut: doc.data().statut
    }));
  };

  const fetchAgencyStats = async (agency: Agency): Promise<Omit<AgencyStats, 'id' | 'nom' | 'ville' | 'companyId'>> => {
    const [startDate, endDate] = dateRange;
    
    const [reservationsSnap, courriersSnap] = await Promise.all([
      getDocs(query(
        collection(db, 'reservations'),
        where('agencyId', '==', agency.id),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      )),
      getDocs(query(
        collection(db, 'courriers'),
        where('agencyId', '==', agency.id),
        where('createdAt', '>=', Timestamp.fromDate(startDate)),
        where('createdAt', '<=', Timestamp.fromDate(endDate))
      ))
    ]);

    return {
      reservations: reservationsSnap.size,
      revenus: reservationsSnap.docs.reduce((sum, doc) => sum + (doc.data().prixTotal || 0), 0),
      courriers: courriersSnap.size
    };
  };

  const calculateGrowthRate = (agencies: AgencyStats[]): number => {
    if (agencies.length === 0) return 0;
    const totalRevenue = agencies.reduce((sum, a) => sum + a.revenus, 0);
    const avgRevenue = totalRevenue / agencies.length;
    return parseFloat((avgRevenue * 0.1).toFixed(2)); // 10% de croissance fictive pour l'exemple
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!user?.companyId) return;
        setLoading(true);
        setError(null);

        const agencies = await fetchAgencies(user.companyId);
        const stats = await Promise.all(
          agencies.map(async agency => ({
            ...agency,
            ...(await fetchAgencyStats(agency))
          }))
        );

        const totals = stats.reduce((acc, curr) => ({
          totalReservations: acc.totalReservations + curr.reservations,
          totalRevenue: acc.totalRevenue + curr.revenus,
          totalCouriers: acc.totalCouriers + curr.courriers,
        }), { totalReservations: 0, totalRevenue: 0, totalCouriers: 0 });

        setAgenciesStats(stats);
        setGlobalStats({
          totalAgencies: agencies.length,
          ...totals,
          growthRate: calculateGrowthRate(stats)
        });
      } catch (err) {
        console.error("Erreur:", err);
        setError("Erreur de chargement des données");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user, dateRange]);

  if (loading) return <div className="p-6 text-center">Chargement en cours...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Compagnie</h1>
          <p className="text-gray-600">
            Données du {dateRange[0].toLocaleDateString()} au {dateRange[1].toLocaleDateString()}
          </p>
        </div>
        <DateRangePicker
          selectsRange={true}
          startDate={dateRange[0]}
          endDate={dateRange[1]}
          onChange={(update) => {
            setDateRange(update as [Date, Date]);
          }}
          className="border rounded p-2"
        />
      </div>

      {/* Cartes Statistiques */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          title="Agences" 
          value={globalStats.totalAgencies} 
          icon={<BuildingOfficeIcon className="h-5 w-5 text-blue-500"/>}
        />
        <StatCard 
          title="Réservations" 
          value={globalStats.totalReservations} 
          trend={`${globalStats.growthRate >= 0 ? '+' : ''}${globalStats.growthRate}%`}
        />
        <StatCard 
          title="Revenus" 
          value={globalStats.totalRevenue} 
          isCurrency={true}
        />
        <StatCard 
          title="Courriers" 
          value={globalStats.totalCouriers} 
        />
      </div>

      {/* Graphique */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="font-semibold text-lg mb-4">Performance par agence</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={agenciesStats}>
              <XAxis dataKey="nom" />
              <YAxis />
              <Tooltip 
                formatter={(value) => [Number(value).toLocaleString(), 'Revenus (FCFA)']}
                labelFormatter={(label) => `Agence: ${label}`}
              />
              <Bar 
                dataKey="revenus" 
                name="Revenus" 
                fill="#6366f1" 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau détaillé */}
      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Agence</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ville</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Réservations</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Revenus</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Courriers</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {agenciesStats.map((agency) => (
              <tr key={agency.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{agency.nom}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{agency.ville}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{agency.reservations.toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{agency.revenus.toLocaleString()} FCFA</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{agency.courriers.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Composant StatCard
const StatCard: React.FC<{
  title: string;
  value: number;
  icon?: React.ReactNode;
  trend?: string;
  isCurrency?: boolean;
}> = ({ title, value, icon, trend, isCurrency = false }) => (
  <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
    <div className="flex justify-between items-center">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {icon}
    </div>
    <div className="mt-2 flex items-baseline">
      <p className="text-2xl font-semibold">
        {isCurrency ? `${value.toLocaleString()} FCFA` : value.toLocaleString()}
      </p>
      {trend && (
        <span className={`ml-2 text-sm ${trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
          {trend}
        </span>
      )}
    </div>
  </div>
);

export default DashboardCompagnie;