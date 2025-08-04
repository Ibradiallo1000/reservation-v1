// ✅ src/pages/CompagnieDashboard.tsx

import React, { useEffect, useState, useCallback } from 'react';
import { collection, query, where, onSnapshot, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import { useNavigate } from 'react-router-dom';

import GlobalStatsHeader from '@/components/dashboardCompagnie/GlobalStatsHeader';
import StatCard from '@/components/dashboardCompagnie/StatCard';
import RevenueLineChart from '@/components/dashboardCompagnie/RevenueLineChart';
import AgencyPerformanceChart from '@/components/dashboardCompagnie/AgencyPerformanceChart';
import TopAgenciesList from '@/components/dashboardCompagnie/TopAgenciesList';
import AgencyDetailsTable from '@/components/dashboardCompagnie/AgencyDetailsTable';

import { Company } from '@/types/companyTypes';

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

const CompagnieDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const { colors, classes } = useCompanyTheme(company);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<[Date | null, Date | null]>([
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

  const fetchCompany = useCallback(async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'companies'), where('id', '==', user.companyId));
    const snap = await getDocs(q);
    if (snap.empty) return;

    const doc = snap.docs[0];
    const data = doc.data();
    setCompany({
      id: doc.id,
      slug: data.slug,
      nom: data.nom,
      services: data.services,
      featuredTrips: data.featuredTrips,
      couleurPrimaire: data.couleurPrimaire,
      couleurSecondaire: data.couleurSecondaire,
      couleurAccent: data.couleurAccent,
      couleurTertiaire: data.couleurTertiaire,
      logoUrl: data.logoUrl,
      villesDisponibles: data.villesDisponibles || [],
      imagesSlider: data.imagesSlider || [],
      sliderImages: data.sliderImages || [],
      suggestions: data.suggestions || [],
    });
  }, [user?.companyId]);

  const calculateGrowthRate = (agencies: AgencyStats[]): number => {
    if (agencies.length === 0) return 0;
    const totalRevenue = agencies.reduce((sum, a) => sum + a.revenus, 0);
    const avgRevenue = totalRevenue / agencies.length;
    return parseFloat((avgRevenue * 0.1).toFixed(2));
  };

  useEffect(() => {
    if (!user?.companyId) return;
    const [startDate, endDate] = dateRange;
    if (!startDate || !endDate) return;

    const unsubscribeAgences: (() => void)[] = [];
    const start = Timestamp.fromDate(startDate);
    const end = Timestamp.fromDate(endDate);

    const listenToAgencies = async () => {
      try {
        setLoading(true);
        setError(null);
        await fetchCompany();

        const agenciesQuery = query(
          collection(db, 'companies', user.companyId, 'agences')
        );

        const agenciesUnsubscribe = onSnapshot(agenciesQuery, (agenciesSnap) => {
          const agencies: Agency[] = agenciesSnap.docs.map(doc => ({
            id: doc.id,
            nom: doc.data().nom,
            ville: doc.data().ville,
            companyId: user.companyId,
          }));

          setGlobalStats(prev => ({
            ...prev,
            totalAgencies: agencies.length
          }));

          unsubscribeAgences.forEach(unsub => unsub());
          unsubscribeAgences.length = 0;

          const channelTotals: Record<string, number> = {};
          const dailyMap: Record<string, number> = {};

          agencies.forEach((agency) => {
            const reservationsRef = query(
              collection(db, 'companies', user.companyId, 'agences', agency.id, 'reservations'),
              where('createdAt', '>=', start),
              where('createdAt', '<=', end)
            );

            const unsubscribe = onSnapshot(reservationsRef, (snapshot) => {
              let reservations = 0;
              let revenus = 0;
              const canaux: Record<string, number> = {};

              snapshot.forEach((doc) => {
                const data = doc.data();
                const canal = (data.canal || 'inconnu').toLowerCase();
                const norm = canal.includes('ligne') ? 'En ligne' : 'Guichet';
                canaux[norm] = (canaux[norm] || 0) + 1;
                channelTotals[norm] = (channelTotals[norm] || 0) + 1;

                const montant = data.montant || 0;
                revenus += montant;
                reservations += 1;

                const dateKey = data.createdAt.toDate().toLocaleDateString('fr-FR');
                dailyMap[dateKey] = (dailyMap[dateKey] || 0) + montant;
              });

              const updatedAgency = {
                ...agency,
                reservations,
                revenus,
                canaux
              };

              setAgenciesStats(prev => {
                const updatedList = [...prev.filter(a => a.id !== agency.id), updatedAgency];

                setGlobalStats(prevStats => ({
                  ...prevStats,
                  totalReservations: updatedList.reduce((acc, ag) => acc + ag.reservations, 0),
                  totalRevenue: updatedList.reduce((acc, ag) => acc + ag.revenus, 0),
                  totalChannels: { ...channelTotals },
                  growthRate: calculateGrowthRate(updatedList)
                }));

                return updatedList;
              });

              const currentDate = new Date(startDate);
              const endDateObj = new Date(endDate);
              const days: DailyRevenue[] = [];

              while (currentDate <= endDateObj) {
                const dateKey = currentDate.toLocaleDateString('fr-FR');
                days.push({
                  date: dateKey,
                  revenue: dailyMap[dateKey] || 0
                });
                currentDate.setDate(currentDate.getDate() + 1);
              }

              setDailyRevenue(days);
            });

            unsubscribeAgences.push(unsubscribe);
          });
        });

        unsubscribeAgences.push(agenciesUnsubscribe);
      } catch (err) {
        console.error('Erreur onSnapshot dashboard compagnie:', err);
        setError('Erreur de chargement des données. Veuillez réessayer.');
      } finally {
        setLoading(false);
      }
    };

    listenToAgencies();

    return () => {
      unsubscribeAgences.forEach(unsub => unsub());
    };
  }, [user?.companyId, dateRange, fetchCompany]);

  const total = Object.values(globalStats.totalChannels).reduce((s, n) => s + n, 0);
  const guichet = globalStats.totalChannels.Guichet || 0;
  const enLigne = globalStats.totalChannels['En ligne'] || 0;

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <h2 className="text-xl font-semibold text-gray-700">Chargement du tableau de bord...</h2>
        <p className="text-gray-500 mt-2">Vos données seront bientôt prêtes</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full text-center border-l-4 border-red-500">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Une erreur est survenue</h3>
        <p className="text-gray-600 mb-6">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        >
          Réessayer
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen p-6 space-y-8 ${classes} bg-gradient-to-br from-gray-50 to-gray-100`}>
      <GlobalStatsHeader 
        dateRange={dateRange as [Date, Date]} 
        setDateRange={setDateRange} 
        colors={colors} 
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
      />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Agences" 
          value={globalStats.totalAgencies}
          onClick={() => navigate('/compagnie/agences')}
          icon={
            <div className="p-3 rounded-full bg-blue-100 text-blue-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          }
          themeColor={colors.primary}
        />
        
        <StatCard 
          title="Réservations" 
          value={globalStats.totalReservations}
          onClick={() => navigate('/compagnie/reservations')}
          trend={globalStats.growthRate >= 0 ? `+${globalStats.growthRate}%` : `${globalStats.growthRate}%`}
          trendType={globalStats.growthRate >= 0 ? 'positive' : 'negative'}
          icon={
            <div className="p-3 rounded-full bg-green-100 text-green-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
          }
          themeColor={colors.secondary}
        />
        
        <StatCard 
          title="Revenus" 
          value={globalStats.totalRevenue}
          onClick={() => navigate('/compagnie/finances')}
          isCurrency 
          icon={
            <div className="p-3 rounded-full bg-purple-100 text-purple-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          }
          themeColor={colors.accent}
        />
        
        <StatCard
          title="Répartition"
          onClick={() => navigate('/compagnie/statistiques')}
          icon={
            <div className="p-3 rounded-full bg-amber-100 text-amber-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
              </svg>
            </div>
          }
          content={
            <div className="mt-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
                  <span className="text-sm">Guichet</span>
                </div>
                <span className="text-sm font-medium">{total ? Math.round((guichet / total) * 100) : 0}%</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  <span className="text-sm">En ligne</span>
                </div>
                <span className="text-sm font-medium">{total ? Math.round((enLigne / total) * 100) : 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-2 rounded-full" 
                  style={{ width: `${total ? (guichet / total) * 100 : 50}%` }}
                ></div>
              </div>
            </div>
          }
          themeColor={colors.tertiary}
          value={0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Évolution des revenus</h3>
            <div className="flex space-x-2">
              <button className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded-md">30j</button>
              <button className="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded-md">90j</button>
              <button className="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded-md">1an</button>
            </div>
          </div>
          <RevenueLineChart data={dailyRevenue} />
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Performance des agences</h3>
          <AgencyPerformanceChart data={agenciesStats} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Top 5 agences</h3>
            <button 
              className="text-sm text-blue-600 hover:text-blue-800"
              onClick={() => navigate('/compagnie/agences')}
            >
              Voir tout
            </button>
          </div>
          <TopAgenciesList agencies={agenciesStats.slice(0, 5)} />
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Détails des agences</h3>
            <div className="flex space-x-2">
              <button className="px-3 py-1 text-xs bg-gray-50 text-gray-600 rounded-md">Exporter</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <AgencyDetailsTable 
              data={agenciesStats} 
              className="min-w-full divide-y divide-gray-200"
            />
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
            <div>Affichage 1-{Math.min(agenciesStats.length, 10)} sur {agenciesStats.length} agences</div>
            <div className="flex space-x-2">
              <button className="px-3 py-1 bg-gray-50 rounded-md disabled:opacity-50" disabled>
                Précédent
              </button>
              <button className="px-3 py-1 bg-gray-50 rounded-md">
                Suivant
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompagnieDashboard;