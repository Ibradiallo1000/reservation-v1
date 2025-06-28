// ✅ src/pages/DashboardCompagnie.tsx
import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import RevenueLineChart from '@/components/dashboardCompagnie/RevenueLineChart';
import TopAgenciesList from '@/components/dashboardCompagnie/TopAgenciesList';
import SalesChannelsBreakdown from '@/components/dashboardCompagnie/SalesChannelsBreakdown';
import StatCard from '@/components/dashboardCompagnie/StatCard';
import AgencyPerformanceChart from '@/components/dashboardCompagnie/AgencyPerformanceChart';
import AgencyDetailsTable from '@/components/dashboardCompagnie/AgencyDetailsTable';
import GlobalStatsHeader from '@/components/dashboardCompagnie/GlobalStatsHeader';

interface Agency {
  id: string;
  nom: string;
  ville: string;
  companyId: string;
}

interface AgencyStats extends Agency {
  reservations: number;
  revenus: number;
  canaux: { [canal: string]: number };
}

interface GlobalStats {
  totalAgencies: number;
  totalReservations: number;
  totalRevenue: number;
  growthRate: number;
  totalChannels: { [canal: string]: number };
}

interface DailyRevenue {
  date: string;
  revenue: number;
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
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalAgencies: 0,
    totalReservations: 0,
    totalRevenue: 0,
    growthRate: 0,
    totalChannels: {}
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
    }));
  };

  const fetchAgencyStats = async (agency: Agency): Promise<Omit<AgencyStats, 'id' | 'nom' | 'ville' | 'companyId'>> => {
    const [startDate, endDate] = dateRange;
    const reservationsSnap = await getDocs(query(
      collection(db, 'reservations'),
      where('agencyId', '==', agency.id),
      where('createdAt', '>=', Timestamp.fromDate(startDate)),
      where('createdAt', '<=', Timestamp.fromDate(endDate))
    ));

    const canaux: { [canal: string]: number } = {};
    const dailyMap: Record<string, number> = {};

    reservationsSnap.forEach(doc => {
      const canal = (doc.data().canal || 'inconnu').toLowerCase().replace(/\s|_|-/g, '');
      const norm = ['enligne', 'online'].includes(canal) ? 'En ligne' : 'Guichet';
      canaux[norm] = (canaux[norm] || 0) + 1;

      // Collecte revenue par jour
      const createdAt: Timestamp = doc.data().createdAt;
      const dateKey = createdAt.toDate().toLocaleDateString();
      const montant = doc.data().montant || 0;
      dailyMap[dateKey] = (dailyMap[dateKey] || 0) + montant;
    });

    Object.entries(dailyMap).forEach(([date, revenue]) => {
      setDailyRevenue(prev => {
        const exist = prev.find(d => d.date === date);
        if (exist) {
          exist.revenue += revenue;
          return [...prev];
        }
        return [...prev, { date, revenue }];
      });
    });

    return {
      reservations: reservationsSnap.size,
      revenus: reservationsSnap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0),
      canaux
    };
  };

  const calculateGrowthRate = (agencies: AgencyStats[]): number => {
    if (agencies.length === 0) return 0;
    const totalRevenue = agencies.reduce((sum, a) => sum + a.revenus, 0);
    const avgRevenue = totalRevenue / agencies.length;
    return parseFloat((avgRevenue * 0.1).toFixed(2));
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        if (!user?.companyId) return;
        setLoading(true);
        setError(null);
        setDailyRevenue([]);

        const agencies = await fetchAgencies(user.companyId);
        const stats = await Promise.all(
          agencies.map(async agency => ({
            ...agency,
            ...(await fetchAgencyStats(agency))
          }))
        );

        const channelsSummary: { [canal: string]: number } = {};
        stats.forEach(a => {
          Object.entries(a.canaux).forEach(([k, v]) => {
            channelsSummary[k] = (channelsSummary[k] || 0) + v;
          });
        });

        const totals = stats.reduce((acc, curr) => ({
          totalReservations: acc.totalReservations + curr.reservations,
          totalRevenue: acc.totalRevenue + curr.revenus,
        }), { totalReservations: 0, totalRevenue: 0 });

        setAgenciesStats(stats);
        setGlobalStats({
          totalAgencies: agencies.length,
          ...totals,
          growthRate: calculateGrowthRate(stats),
          totalChannels: channelsSummary
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

  if (loading) return <div className="p-6 text-center">Chargement...</div>;
  if (error) return <div className="p-6 text-red-500">{error}</div>;

  return (
    <div className="p-6 space-y-8">
      <GlobalStatsHeader dateRange={dateRange} setDateRange={setDateRange} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Agences" value={globalStats.totalAgencies} />
        <StatCard title="Réservations" value={globalStats.totalReservations} trend={`${globalStats.growthRate}%`} />
        <StatCard title="Revenus" value={globalStats.totalRevenue} isCurrency />
      </div>

      <SalesChannelsBreakdown channels={globalStats.totalChannels} />

      <RevenueLineChart data={dailyRevenue} />

      <AgencyPerformanceChart data={agenciesStats} />

      <TopAgenciesList agencies={agenciesStats} />

      <AgencyDetailsTable data={agenciesStats} />
    </div>
  );
};

export default DashboardCompagnie;
