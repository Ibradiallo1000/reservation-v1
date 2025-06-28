import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, Timestamp, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '../roles-permissions';
import type { Role } from '../roles-permissions';
import type { Reservation } from '@/types/index';

// Import des composants UI
import {
  MetricCard,
  RevenueChart,
  ChannelsChart,
  DestinationsChart,
  TopTrajetsCard,
  NextDepartureCard
} from '@/components/dashboard';

// Import des icônes
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

// Interfaces pour typer les données statistiques
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
  // Contextes et états
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [dateRange, setDateRange] = useState<[Date, Date]>([new Date(new Date().setDate(new Date().getDate() - 7)), new Date()]);
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

  // Formate la date en JJ/MM
  const formatDate = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
  };

  // Fonction principale pour récupérer les statistiques
  const fetchStats = useCallback(async (startDate: Date, endDate: Date) => {
    const agencyIdFromQuery = searchParams.get('aid');
    const agencyId = agencyIdFromQuery || user?.agencyId;
    if (!agencyId) return;

    setIsLoading(true);
    try {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      // Requête pour récupérer les réservations
      const reservationsQuery = query(
        collection(db, 'reservations'),
        where('agencyId', '==', agencyId),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp)
      );
      const reservationsSnap = await getDocs(reservationsQuery);

      const reservations: Reservation[] = reservationsSnap.docs.map(doc => ({
        ...(doc.data() as Reservation),
        id: doc.id
      }));

      // Récupération des trajets hebdomadaires pour les noms des routes
      const weeklyTripsSnap = await getDocs(collection(db, 'weeklyTrips'));
      const weeklyTripsMap: Record<string, { departure: string; arrival: string }> = {};

      weeklyTripsSnap.forEach(doc => {
        weeklyTripsMap[doc.id] = {
          departure: doc.data().departure,
          arrival: doc.data().arrival
        };
      });

      // Initialisation des compteurs
      let totalRevenue = 0;
      const channelCounts: Record<string, number> = { online: 0, counter: 0 };
      const destinationCounts: Record<string, number> = {};
      const trajetStats: Record<string, { count: number; revenue: number; departure?: string; arrival?: string }> = {};
      const dailyStatsMap: Record<string, { count: number; revenue: number }> = {};

      // Traitement de chaque réservation
      reservations.forEach(reservation => {
        // Revenu total
        totalRevenue += reservation.montant || 0;

        // Analyse du canal de réservation (CORRECTION APPLIQUÉE ICI)
        let canal = reservation.canal?.toLowerCase().trim() || 'counter';
        const normalizedCanal = canal.replace(/\s|_|-/g, ''); // Normalisation

        if (['enligne', 'online', 'enligne'].includes(normalizedCanal)) {
          canal = 'online';
        } else if (['guichet', 'surplace', 'counter'].includes(normalizedCanal)) {
          canal = 'counter';
        } else {
          canal = 'counter'; // Fallback
        }

        channelCounts[canal] = (channelCounts[canal] || 0) + 1;

        // Statistiques par destination
        const depart = reservation.depart || 'Inconnu';
        destinationCounts[depart] = (destinationCounts[depart] || 0) + 1;

        // Statistiques par trajet
        const trajetId = reservation.trajetId || 'inconnu';
        if (!trajetStats[trajetId]) {
          trajetStats[trajetId] = { count: 0, revenue: 0 };
        }
        trajetStats[trajetId].count += 1;
        trajetStats[trajetId].revenue += reservation.montant || 0;

        // Stockage des infos de départ/arrivée comme fallback
        if (!trajetStats[trajetId].departure && reservation.depart) {
          trajetStats[trajetId].departure = reservation.depart;
          trajetStats[trajetId].arrival = reservation.arrivee;
        }

        // Statistiques journalières
        if (reservation.createdAt) {
          const date = reservation.createdAt.toDate();
          const dateKey = formatDate(date);
          if (!dailyStatsMap[dateKey]) {
            dailyStatsMap[dateKey] = { count: 0, revenue: 0 };
          }
          dailyStatsMap[dateKey].count += 1;
          dailyStatsMap[dateKey].revenue += reservation.montant || 0;
        }
      });

      // Formatage des statistiques journalières
      const dailyStats = Object.entries(dailyStatsMap)
        .map(([date, { count, revenue }]) => ({
          date,
          reservations: count,
          revenue
        }))
        .sort((a, b) => {
          const [aDay, aMonth] = a.date.split('/').map(Number);
          const [bDay, bMonth] = b.date.split('/').map(Number);
          return aMonth === bMonth ? aDay - bDay : aMonth - bMonth;
        });

      // Formatage des trajets les plus populaires
      const topRoutes = Object.entries(trajetStats)
        .map(([trajetId, stats]) => {
          const routeInfo = weeklyTripsMap[trajetId] || { 
            departure: stats.departure || '?', 
            arrival: stats.arrival || '?' 
          };
          return {
            id: trajetId,
            name: `${routeInfo.departure} → ${routeInfo.arrival}`,
            count: stats.count,
            revenue: stats.revenue
          };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      // Formatage des destinations
      const topDestinations = Object.entries(destinationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      // Formatage des canaux de réservation
      const channelData: ChannelStat[] = [
        { name: 'En ligne', value: channelCounts.online },
        { name: 'Guichet', value: channelCounts.counter }
      ];

      // Récupération du prochain départ
      let nextDeparture = '—';
      try {
        const prochainDepartQuery = query(
          collection(db, 'departures'),
          where('agencyId', '==', agencyId),
          where('date', '>=', Timestamp.now()),
          orderBy('date', 'asc'),
          limit(1)
        );
        const prochainDepartSnap = await getDocs(prochainDepartQuery);
        const prochain = prochainDepartSnap.docs[0]?.data();
        if (prochain) {
          nextDeparture = `${prochain.departure || '?'} → ${prochain.arrival || '?'} à ${prochain.heure || '?'}`;
        }
      } catch (err) {
        console.error("Erreur récupération prochain départ:", err);
      }

      // Mise à jour de l'état avec toutes les statistiques
      setStats({
        sales: reservations.length,
        totalRevenue,
        dailyStats,
        nextDeparture,
        destinations: topDestinations,
        channels: channelData,
        topRoutes
      });
    } catch (err) {
      console.error("Erreur:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, searchParams]);

  // Effet pour charger les stats quand la plage de dates change
  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
  }, [fetchStats, dateRange]);

  // Gestion du changement de période (jour/semaine/mois/année)
  const handleTimeRangeChange = (range: string) => {
    const now = new Date();
    let startDate = new Date();
    switch (range) {
      case 'day': startDate.setDate(now.getDate() - 1); break;
      case 'week': startDate.setDate(now.getDate() - 7); break;
      case 'month': startDate.setMonth(now.getMonth() - 1); break;
      case 'year': startDate.setFullYear(now.getFullYear() - 1); break;
      default: startDate.setDate(now.getDate() - 7);
    }
    setTimeRange(range);
    setDateRange([startDate, now]);
  };

  // Vérification des permissions
  if (!user || !hasPermission(user.role as Role, 'reservations')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100" />
          </CardHeader>
          <CardContent>
            <h3 className="text-lg font-medium">Accès refusé</h3>
            <p className="text-muted-foreground mt-2">Vous n'avez pas les permissions nécessaires.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Rendu principal du tableau de bord
  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* En-tête avec titre et filtres */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tableau de bord - Réservations</h1>
            <p className="text-muted-foreground">{user.agencyName} • Mis à jour à {new Date().toLocaleTimeString()}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Tabs value={timeRange} onValueChange={handleTimeRangeChange}>
              <TabsList>
                <TabsTrigger value="day">Aujourd'hui</TabsTrigger>
                <TabsTrigger value="week">7 jours</TabsTrigger>
                <TabsTrigger value="month">Mois</TabsTrigger>
                <TabsTrigger value="year">Année</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" className="gap-2">
              <DocumentArrowDownIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Exporter</span>
            </Button>
          </div>
        </div>

        {/* Cartes de métriques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard 
            title="Billets vendus" 
            value={stats.sales} 
            icon={<TicketIcon className="h-5 w-5" />} 
            color="primary" 
            link="/reservations" 
            isLoading={isLoading} 
          />
          <MetricCard 
            title="Revenus totaux" 
            value={stats.totalRevenue} 
            icon={<CurrencyDollarIcon className="h-5 w-5" />} 
            color="success" 
            isCurrency 
            isLoading={isLoading} 
          />
          <MetricCard 
            title="En ligne" 
            value={stats.channels.find(c => c.name === 'En ligne')?.value || 0} 
            icon={<ComputerDesktopIcon className="h-5 w-5" />} 
            color="info" 
            isLoading={isLoading} 
          />
          <MetricCard 
            title="Au guichet" 
            value={stats.channels.find(c => c.name === 'Guichet')?.value || 0} 
            icon={<BuildingStorefrontIcon className="h-5 w-5" />} 
            color="warning" 
            isLoading={isLoading} 
          />
        </div>

        {/* Graphiques principaux */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueChart data={stats.dailyStats} isLoading={isLoading} />
          </div>
          <div className="space-y-6">
            <ChannelsChart data={stats.channels} isLoading={isLoading} />
            <NextDepartureCard departure={stats.nextDeparture} isLoading={isLoading} />
          </div>
        </div>

        {/* Graphiques secondaires */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DestinationsChart destinations={stats.destinations} isLoading={isLoading} />
          <TopTrajetsCard trajets={stats.topRoutes} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
};

export default DashboardAgencePage;