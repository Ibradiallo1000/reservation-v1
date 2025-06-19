import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, Timestamp, orderBy, limit, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '../roles-permissions';
import type { Role } from '../roles-permissions';
import { 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  Legend 
} from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  DocumentArrowDownIcon, 
  ChartBarIcon, 
  UserGroupIcon, 
  TicketIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon, 
  ClockIcon, 
  MapPinIcon, 
  CalendarIcon,
  CurrencyDollarIcon,
  UsersIcon,
  TruckIcon,
  ChatBubbleBottomCenterTextIcon,
  CheckBadgeIcon
} from '@heroicons/react/24/outline';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// Types
interface DailyStat {
  date: string;
  reservations: number;
  revenus: number;
}

interface Agent {
  id: string;
  nom: string;
  role: string;
  lastActive: string;
  avatar?: string;
}

interface DestinationStat {
  name: string;
  value: number;
}

interface DashboardStats {
  ventes: number;
  totalEncaisse: number;
  courriersEnvoyes: number;
  courriersRecus: number;
  courriersEnAttente: number;
  retards: number;
  satisfaction: number;
  occupation: number;
  agents: Agent[];
  topDestination: string;
  prochainDepart: string;
  dailyStats: DailyStat[];
  destinations: DestinationStat[];
}

const COLORS = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'];

// Components
const MetricCard = React.memo(({
  title,
  value,
  icon,
  color = 'primary',
  isCurrency = false,
  unit = '',
  link,
  isLoading = false
}: {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  isCurrency?: boolean;
  unit?: string;
  link?: string;
  isLoading?: boolean;
}) => {
  const colorClasses = {
    primary: 'bg-indigo-100 text-indigo-600',
    success: 'bg-emerald-100 text-emerald-600',
    warning: 'bg-amber-100 text-amber-600',
    danger: 'bg-rose-100 text-rose-600',
    info: 'bg-blue-100 text-blue-600'
  };

  const formattedValue = isCurrency 
    ? `${Number(value).toLocaleString()} FCFA` 
    : typeof value === 'number' 
      ? `${value.toLocaleString()}${unit}` 
      : value;

  const content = (
    <Card className="h-full transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-3/4" />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-2xl font-bold"
          >
            {formattedValue}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );

  return link ? (
    <a href={link} className="block h-full">
      {content}
    </a>
  ) : content;
});

const AgentCard = ({ agent }: { agent: Agent }) => {
  const displayName = agent.nom || 'Inconnu';
  const role = agent.role || 'Non défini';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50 rounded-lg"
    >
      <div className="relative">
        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white font-medium">
          {initials}
        </div>
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white"></span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{displayName}</p>
        <p className="text-sm text-muted-foreground capitalize">{role.toLowerCase()}</p>
      </div>
      <div className="text-sm text-muted-foreground">
        {agent.lastActive || 'Inconnu'}
      </div>
    </motion.div>
  );
};

const RevenueChart = ({ data, isLoading }: { data: DailyStat[]; isLoading: boolean }) => {
  const [showReservations, setShowReservations] = useState(false);

  if (isLoading) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Performance sur 7 jours</CardTitle>
          <div className="flex items-center space-x-2">
            <Label htmlFor="reservations-toggle">Réservations</Label>
            <Switch 
              id="reservations-toggle"
              checked={showReservations}
              onCheckedChange={setShowReservations}
            />
            <Label htmlFor="reservations-toggle">Revenus</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis 
                dataKey="date" 
                tick={{ fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value) => [
                  showReservations 
                    ? `${value} réservations` 
                    : `${Number(value).toLocaleString()} FCFA`,
                  showReservations ? 'Réservations' : 'Revenus'
                ]}
              />
              <Bar 
                dataKey={showReservations ? "reservations" : "revenus"} 
                fill="#6366F1" 
                radius={[4, 4, 0, 0]} 
                animationDuration={1500}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const DestinationsChart = ({ data, isLoading }: { data: DestinationStat[]; isLoading: boolean }) => {
  if (isLoading) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Destinations populaires</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                animationDuration={1500}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [value, 'réservations']}
                contentStyle={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

const NextDepartureCard = ({ departure, isLoading }: { departure: string; isLoading: boolean }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Prochain départ</CardTitle>
          <TruckIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-12 w-full" />
        ) : (
          <div className="text-center py-4">
            <AnimatePresence mode="wait">
              <motion.p
                key={departure}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-2xl font-bold text-foreground"
              >
                {departure}
              </motion.p>
            </AnimatePresence>
            {departure !== '—' && (
              <p className="text-muted-foreground mt-2">Prochain départ programmé</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const AgentsList = ({ agents, isLoading }: { agents: Agent[]; isLoading: boolean }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Équipe active</CardTitle>
          <Badge variant="outline">{agents.length} membres</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DashboardAgencePage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().setDate(new Date().getDate() - 7)),
    new Date()
  ]);
  const [stats, setStats] = useState<DashboardStats>({
    ventes: 0,
    totalEncaisse: 0,
    courriersEnvoyes: 0,
    courriersRecus: 0,
    courriersEnAttente: 0,
    retards: 0,
    satisfaction: 0,
    occupation: 0,
    agents: [],
    topDestination: '',
    prochainDepart: '',
    dailyStats: [],
    destinations: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const fetchStats = useCallback(async (startDate: Date, endDate: Date) => {
    const agencyIdFromQuery = searchParams.get('aid');
    const agencyId = agencyIdFromQuery || user?.agencyId;
    if (!agencyId) return;

    setLoading(true);
    setError(null);

    try {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      // Requête pour les réservations
      const reservationsQuery = query(
        collection(db, 'reservations'),
        where('agencyId', '==', agencyId),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp)
      );
      const reservationsSnap = await getDocs(reservationsQuery);

      // Calcul du revenu total
      let totalRevenue = 0;
      reservationsSnap.forEach(doc => {
        totalRevenue += doc.data().price || 0;
      });

      // Requête pour les courriers envoyés
      const courriersEnvQuery = query(
        collection(db, 'courriers'),
        where('agencyId', '==', agencyId),
        where('type', '==', 'envoi'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const courriersEnvSnap = await getDocs(courriersEnvQuery);

      // Requête pour les courriers reçus
      const courriersRecQuery = query(
        collection(db, 'courriers'),
        where('agencyId', '==', agencyId),
        where('type', '==', 'reception'),
        where('date', '>=', startTimestamp),
        where('date', '<=', endTimestamp)
      );
      const courriersRecSnap = await getDocs(courriersRecQuery);

      // Requête pour les courriers en attente
      const courriersAttenteQuery = query(
        collection(db, 'courriers'),
        where('agencyId', '==', agencyId),
        where('status', '==', 'en_attente')
      );
      const courriersAttenteSnap = await getDocs(courriersAttenteQuery);

      // Requête pour les retards
      const retardsQuery = query(
        collection(db, 'reservations'),
        where('agencyId', '==', agencyId),
        where('isDelayed', '==', true)
      );
      const retardsSnap = await getDocs(retardsQuery);

      // Requête pour les statistiques de satisfaction
      const satisfactionQuery = query(
        collection(db, 'feedbacks'),
        where('agencyId', '==', agencyId)
      );
      const satisfactionSnap = await getDocs(satisfactionQuery);
      
      let satisfactionAvg = 0;
      if (!satisfactionSnap.empty) {
        const total = satisfactionSnap.docs.reduce((sum, doc) => sum + (doc.data().rating || 0), 0);
        satisfactionAvg = total / satisfactionSnap.size;
      }

      // Calcul du taux d'occupation (exemple simplifié)
      const totalCapacity = 100; // À remplacer par votre logique métier
      const occupationRate = reservationsSnap.size / totalCapacity;

      // Requête pour les agents
      const usersQuery = query(
        collection(db, 'users'),
        where('agencyId', '==', agencyId),
        where('isActive', '==', true)
      );
      const usersSnap = await getDocs(usersQuery);

      // Requête pour les destinations populaires
      const destinationsQuery = query(
        collection(db, 'destinations'),
        where('agencyId', '==', agencyId),
        orderBy('reservationCount', 'desc'),
        limit(5)
      );
      const destinationsSnap = await getDocs(destinationsQuery);
      const topDestinations = destinationsSnap.docs.map(doc => ({
        name: doc.data().name,
        value: doc.data().reservationCount
      }));

      // Requête pour le prochain départ
      const prochainDepartQuery = query(
        collection(db, 'departures'),
        where('agencyId', '==', agencyId),
        where('date', '>=', Timestamp.now()),
        orderBy('date', 'asc'),
        limit(1)
      );
      const prochainDepartSnap = await getDocs(prochainDepartQuery);
      const prochain = prochainDepartSnap.docs[0]?.data();

      // Requête pour les statistiques quotidiennes
      const dailyStatsQuery = query(
        collection(db, 'dailyStats'),
        where('agencyId', '==', agencyId),
        where('date', '>=', formatDate(startDate)),
        where('date', '<=', formatDate(endDate)),
        orderBy('date', 'asc')
      );
      const dailyStatsSnap = await getDocs(dailyStatsQuery);

      setStats({
        ventes: reservationsSnap.size,
        totalEncaisse: totalRevenue,
        courriersEnvoyes: courriersEnvSnap.size,
        courriersRecus: courriersRecSnap.size,
        courriersEnAttente: courriersAttenteSnap.size,
        retards: retardsSnap.size,
        satisfaction: parseFloat(satisfactionAvg.toFixed(1)),
        occupation: parseFloat((occupationRate * 100).toFixed(1)),
        agents: usersSnap.docs.map((doc: QueryDocumentSnapshot) => ({
          id: doc.id,
          nom: doc.data().displayName || 'Inconnu',
          role: doc.data().role || 'agent',
          lastActive: doc.data().lastActive || 'Inconnu'
        })),
        topDestination: topDestinations[0]?.name || '—',
        prochainDepart: prochain ? `${prochain.departure || '?'} → ${prochain.arrival || '?'} à ${prochain.heure || '?'}` : '—',
        dailyStats: dailyStatsSnap.docs.map((doc: QueryDocumentSnapshot) => {
          const rawDate = doc.data().date;
          const [year, month, day] = rawDate.split('-');
          return {
            date: `${day}/${month}`,
            reservations: doc.data().reservations || 0,
            revenus: doc.data().revenue || 0
          };
        }),
        destinations: topDestinations
      });
    } catch (err) {
      console.error("Erreur:", err);
      setError("Une erreur est survenue lors du chargement des données");
    } finally {
      setLoading(false);
    }
  }, [user, searchParams]);

  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
  }, [fetchStats, dateRange]);

  const handleExport = () => {
    console.log("Export des données");
  };

  if (!user || !hasPermission(user.role as Role, 'reservations')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="text-lg font-medium">Accès refusé</h3>
            <p className="text-muted-foreground mt-2">
              Vous n'avez pas les permissions nécessaires pour accéder à ce tableau de bord.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <svg
                className="h-6 w-6 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
          </CardHeader>
          <CardContent>
            <h3 className="text-lg font-medium">Erreur de chargement</h3>
            <p className="text-muted-foreground mt-2">{error}</p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button onClick={() => fetchStats(dateRange[0], dateRange[1])}>
              Réessayer
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tableau de bord</h1>
            <p className="text-muted-foreground">
              {user.agencyName} • Mis à jour à {new Date().toLocaleTimeString()}
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-background p-2 rounded-lg border">
              <CalendarIcon className="h-5 w-5 text-muted-foreground" />
              <DatePicker
                selected={dateRange[0]}
                onChange={(date) => setDateRange([date as Date, dateRange[1]])}
                selectsStart
                startDate={dateRange[0]}
                endDate={dateRange[1]}
                className="w-28 border-none text-sm focus:ring-0 bg-transparent"
                dateFormat="dd/MM"
              />
              <span className="text-muted-foreground">à</span>
              <DatePicker
                selected={dateRange[1]}
                onChange={(date) => setDateRange([dateRange[0], date as Date])}
                selectsEnd
                startDate={dateRange[0]}
                endDate={dateRange[1]}
                minDate={dateRange[0]}
                className="w-28 border-none text-sm focus:ring-0 bg-transparent"
                dateFormat="dd/MM"
              />
            </div>
            
            <Button 
              variant="outline"
              onClick={handleExport}
              className="gap-2"
            >
              <DocumentArrowDownIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Exporter</span>
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Billets vendus"
            value={stats.ventes}
            icon={<TicketIcon className="h-5 w-5" />}
            color="primary"
            link="/reservations"
            isLoading={loading}
          />
          <MetricCard
            title="Revenus totaux"
            value={stats.totalEncaisse}
            icon={<CurrencyDollarIcon className="h-5 w-5" />}
            color="success"
            isCurrency
            isLoading={loading}
          />
          <MetricCard
            title="Courriers envoyés"
            value={stats.courriersEnvoyes}
            icon={<ArrowUpTrayIcon className="h-5 w-5" />}
            color="info"
            link="/courriers?type=envoi"
            isLoading={loading}
          />
          <MetricCard
            title="Courriers reçus"
            value={stats.courriersRecus}
            icon={<ArrowDownTrayIcon className="h-5 w-5" />}
            color="warning"
            link="/courriers?type=retrait"
            isLoading={loading}
          />
          <MetricCard
            title="En attente"
            value={stats.courriersEnAttente}
            icon={<ClockIcon className="h-5 w-5" />}
            color="danger"
            link="/courriers?statut=en_attente"
            isLoading={loading}
          />
          <MetricCard
            title="Agents actifs"
            value={stats.agents.length}
            icon={<UsersIcon className="h-5 w-5" />}
            color="primary"
            link="/agents"
            isLoading={loading}
          />
          <MetricCard
            title="Taux d'occupation"
            value={stats.occupation}
            icon={<ChartBarIcon className="h-5 w-5" />}
            color="success"
            unit="%"
            isLoading={loading}
          />
          <MetricCard
            title="Satisfaction"
            value={stats.satisfaction}
            icon={<ChatBubbleBottomCenterTextIcon className="h-5 w-5" />}
            color="warning"
            unit="/5"
            isLoading={loading}
          />
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <RevenueChart data={stats.dailyStats} isLoading={loading} />
          </div>
          <div>
            <DestinationsChart data={stats.destinations} isLoading={loading} />
          </div>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <NextDepartureCard departure={stats.prochainDepart} isLoading={loading} />
          <AgentsList agents={stats.agents} isLoading={loading} />
        </div>
      </div>
    </div>
  );
};

export default DashboardAgencePage;