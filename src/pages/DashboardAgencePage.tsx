import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, Timestamp, orderBy, limit, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import type { Reservation } from '@/types/index';
import { toJSDate } from '@/utils/toJSDate';

import {
  MetricCard,
  RevenueChart,
  ChannelsChart,
  DestinationsChart,
  TopTrajetsCard,
  NextDepartureCard
} from '@/components/dashboard';

import {
  TicketIcon,
  CurrencyDollarIcon,
  ComputerDesktopIcon,
  BuildingStorefrontIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';

import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

interface DailyStat {
  date: string;
  reservations: number;
  revenue: number;
}

interface DestinationStat {
  name: string;
  count: number;
}

interface ChannelStat {
  name: string;
  value: number;
}

interface TopRoute {
  id: string;
  name: string;
  count: number;
  revenue: number;
}

interface DashboardStats {
  sales: number;
  totalRevenue: number;
  dailyStats: DailyStat[];
  nextDeparture: string;
  destinations: DestinationStat[];
  channels: ChannelStat[];
  topRoutes: TopRoute[];
}

const DashboardAgencePage: React.FC = () => {
  const { user, company } = useAuth();
  const theme = useCompanyTheme(company);
  const { id: agencyIdFromRoute } = useParams();

  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().setDate(new Date().getDate() - 7)),
    new Date()
  ]);
  const [timeRange, setTimeRange] = useState('week');

  const [stats, setStats] = useState<DashboardStats>({
    sales: 0,
    totalRevenue: 0,
    dailyStats: [],
    nextDeparture: '',
    destinations: [],
    channels: [],
    topRoutes: []
  });
  const [isLoading, setIsLoading] = useState(true);

  const unsubscribeRef = useRef<() => void>();

  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  const fetchStats = useCallback(async (startDate: Date, endDate: Date) => {
    const agencyId = agencyIdFromRoute || user?.agencyId;
    const companyId = user?.companyId;
    if (!agencyId || !companyId) return;

    setIsLoading(true);

    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }

    try {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      const reservationsQuery = query(
        collection(db, 'companies', companyId, 'agences', agencyId, 'reservations'),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp)
      );

      const unsubscribe = onSnapshot(reservationsQuery, async (reservationsSnap) => {
        const reservations: Reservation[] = reservationsSnap.docs.map(doc => ({
          ...(doc.data() as Reservation),
          id: doc.id
        }));

        let totalRevenue = 0;
        const channelCounts: Record<string, number> = { online: 0, counter: 0 };
        const destinationCounts: Record<string, number> = {};
        const dailyStatsMap: Record<string, { count: number; revenue: number }> = {};
        const trajetStats: Record<string, { count: number; revenue: number; departure?: string; arrival?: string }> = {};

        reservations.forEach(reservation => {
          totalRevenue += reservation.montant || 0;

          let canal = reservation.canal?.toLowerCase().trim() || 'counter';
          const normalizedCanal = canal.replace(/\s|_|-/g, '');
          canal = ['enligne', 'online'].includes(normalizedCanal) ? 'online' : 'counter';
          channelCounts[canal] = (channelCounts[canal] || 0) + 1;

          const depart = reservation.depart || 'Inconnu';
          destinationCounts[depart] = (destinationCounts[depart] || 0) + 1;

          const trajetId = reservation.trajetId || 'inconnu';
          if (!trajetStats[trajetId]) trajetStats[trajetId] = { count: 0, revenue: 0 };
          trajetStats[trajetId].count += 1;
          trajetStats[trajetId].revenue += reservation.montant || 0;

          if (!trajetStats[trajetId].departure && reservation.depart) {
            trajetStats[trajetId].departure = reservation.depart;
            trajetStats[trajetId].arrival = reservation.arrivee;
          }

          if (reservation.createdAt) {
            const date = toJSDate(reservation.createdAt);
            const dateKey = formatDate(date);
            if (!dailyStatsMap[dateKey]) dailyStatsMap[dateKey] = { count: 0, revenue: 0 };
            dailyStatsMap[dateKey].count += 1;
            dailyStatsMap[dateKey].revenue += reservation.montant || 0;
          }
        });

        const dailyStats = Object.entries(dailyStatsMap)
          .map(([date, { count, revenue }]) => ({ date, reservations: count, revenue }))
          .sort((a, b) => {
            const [aDay, aMonth] = a.date.split('/').map(Number);
            const [bDay, bMonth] = b.date.split('/').map(Number);
            return aMonth === bMonth ? aDay - bDay : aMonth - bMonth;
          });

        const channelData: ChannelStat[] = [
          { name: 'En ligne', value: channelCounts.online },
          { name: 'Guichet', value: channelCounts.counter }
        ];

        setStats({
          sales: reservations.length,
          totalRevenue,
          dailyStats,
          nextDeparture: '—',
          destinations: Object.entries(destinationCounts).map(([name, count]) => ({ name, count })),
          channels: channelData,
          topRoutes: Object.entries(trajetStats).map(([trajetId, stats]) => ({
            id: trajetId,
            name: `${stats.departure || '?'} → ${stats.arrival || '?'}`,
            count: stats.count,
            revenue: stats.revenue
          }))
        });
        setIsLoading(false);
      });

      unsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error("Erreur:", err);
      setIsLoading(false);
    }
  }, [user, agencyIdFromRoute]);

  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [fetchStats, dateRange]);

  return (
    <div 
      className="min-h-screen p-4 md:p-6" 
      style={{ backgroundColor: theme.colors.background }}
    >
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 
              className="text-2xl md:text-3xl font-bold" 
              style={{ color: theme.colors.primary }}
            >
              Tableau de bord - Réservations
            </h1>
            <p 
              className="px-3 py-1 rounded-md text-sm font-medium shadow-sm"
              style={{ 
                backgroundColor: `${theme.colors.secondary}20`, 
                color: theme.colors.primary 
              }}
            >
              {user?.agencyName} • Mis à jour à {new Date().toLocaleTimeString()}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Tabs value={timeRange} onValueChange={setTimeRange}>
              <TabsList style={{ backgroundColor: theme.colors.secondary, color: theme.colors.text }}>
                <TabsTrigger value="day">Aujourd'hui</TabsTrigger>
                <TabsTrigger value="week">7 jours</TabsTrigger>
                <TabsTrigger value="month">Mois</TabsTrigger>
                <TabsTrigger value="year">Année</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button 
              variant="outline" 
              className="gap-2 border rounded-lg shadow-sm"
              style={{ borderColor: theme.colors.primary, color: theme.colors.primary }}
            >
              <DocumentArrowDownIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Exporter</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard 
            title="Billets vendus" 
            value={stats.sales} 
            icon={<TicketIcon className="h-5 w-5" style={{ color: theme.colors.secondary }} />} 
            color="primary" 
            link="/reservations" 
            isLoading={isLoading} 
          />
          <MetricCard 
            title="Revenus totaux" 
            value={stats.totalRevenue} 
            icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: theme.colors.primary }} />} 
            color="success" 
            isCurrency 
            isLoading={isLoading} 
          />
          <MetricCard 
            title="En ligne" 
            value={stats.channels.find(c => c.name === 'En ligne')?.value || 0} 
            icon={<ComputerDesktopIcon className="h-5 w-5" style={{ color: theme.colors.primary }} />} 
            color="info" 
            isLoading={isLoading} 
          />
          <MetricCard 
            title="Au guichet" 
            value={stats.channels.find(c => c.name === 'Guichet')?.value || 0} 
            icon={<BuildingStorefrontIcon className="h-5 w-5" style={{ color: theme.colors.secondary }} />} 
            color="warning" 
            isLoading={isLoading} 
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-4 rounded-lg shadow-md bg-white">
            <RevenueChart data={stats.dailyStats} isLoading={isLoading} />
          </div>
          <div className="space-y-6">
            <div className="p-4 rounded-lg shadow-md bg-white">
              <ChannelsChart data={stats.channels} isLoading={isLoading} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="p-4 rounded-lg shadow-md bg-white">
            <NextDepartureCard isLoading={isLoading} />
          </div>
          <div className="p-4 rounded-lg shadow-md bg-white">
            <DestinationsChart destinations={stats.destinations} isLoading={isLoading} />
          </div>
          <div className="p-4 rounded-lg shadow-md bg-white">
            <TopTrajetsCard trajets={stats.topRoutes} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardAgencePage;