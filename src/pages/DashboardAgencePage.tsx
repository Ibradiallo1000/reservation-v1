import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '../roles-permissions';
import type { Role } from '../roles-permissions';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { motion } from 'framer-motion';
import { DocumentArrowDownIcon, Cog6ToothIcon, ChartBarIcon, UserGroupIcon, TicketIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, ClockIcon, MapPinIcon, CalendarIcon } from '@heroicons/react/24/outline';

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
}

interface DestinationStat {
  name: string;
  value: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

const DashboardAgencePage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [dateRange, setDateRange] = useState<[Date, Date]>([
    new Date(new Date().setDate(new Date().getDate() - 7)),
    new Date()
  ]);
  const [stats, setStats] = useState({
    ventes: 0,
    totalEncaisse: 0,
    courriersEnvoyes: 0,
    courriersRecus: 0,
    courriersEnAttente: 0,
    retards: 0,
    satisfaction: 0,
    occupation: 0,
    agents: [] as Agent[],
    topDestination: '',
    prochainDepart: '',
    dailyStats: [] as DailyStat[],
    destinations: [] as DestinationStat[],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async (startDate: Date, endDate: Date) => {
    const agencyIdFromQuery = searchParams.get('aid');
    const agencyId = agencyIdFromQuery || user?.agencyId;
    if (!agencyId) return;

    setLoading(true);
    setError(null);

    try {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);

      const [
        reservationsSnap,
        courriersEnvSnap,
        courriersRecSnap,
        courriersAttenteSnap,
        retardsSnap,
        satisfactionSnap,
        occupationSnap,
        usersSnap,
        tripsSnap,
        dailyStatsSnap,
        destinationsSnap
      ] = await Promise.all([
        getDocs(query(
          collection(db, 'reservations'),
          where('agencyId', '==', agencyId),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        )),
        getDocs(query(
          collection(db, 'courriers'),
          where('agencyId', '==', agencyId),
          where('type', '==', 'envoi'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        )),
        getDocs(query(
          collection(db, 'courriers'),
          where('agencyId', '==', agencyId),
          where('type', '==', 'retrait'),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        )),
        getDocs(query(
          collection(db, 'courriers'),
          where('agencyId', '==', agencyId),
          where('statut', '==', 'en_attente')
        )),
        getDocs(query(
          collection(db, 'trips'),
          where('agencyId', '==', agencyId),
          where('statut', '==', 'retard')
        )),
        getDocs(query(
          collection(db, 'feedback'),
          where('agencyId', '==', agencyId),
          where('createdAt', '>=', startTimestamp),
          where('createdAt', '<=', endTimestamp)
        )),
        getDocs(query(
          collection(db, 'vehicles'),
          where('agencyId', '==', agencyId)
        )),
        getDocs(query(
          collection(db, 'users'),
          where('agencyId', '==', agencyId)
        )),
        getDocs(query(
          collection(db, 'dailyTrips'),
          where('agencyId', '==', agencyId),
          where('date', '==', new Date().toISOString().split('T')[0])
        )),
        getDocs(query(
          collection(db, 'dailyStats'),
          where('agencyId', '==', agencyId),
          where('date', '>=', Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() - 7)))),
          where('date', '<=', Timestamp.fromDate(new Date()))
        )),
        getDocs(query(
          collection(db, 'destinations'),
          where('agencyId', '==', agencyId)
        ))
      ]);

      // Calcul des indicateurs
      const totalRevenue = reservationsSnap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
      const satisfactionAvg = satisfactionSnap.size > 0 
        ? satisfactionSnap.docs.reduce((sum, doc) => sum + (doc.data().rating || 0), 0) / satisfactionSnap.size
        : 0;
      const occupationRate = occupationSnap.size > 0
        ? occupationSnap.docs.reduce((sum, doc) => sum + (doc.data().occupation || 0), 0) / occupationSnap.size
        : 0;

      // Destinations populaires
      const destinationCounts: Record<string, number> = {};
      reservationsSnap.docs.forEach(doc => {
        const arrival = doc.data().arrival;
        if (arrival) destinationCounts[arrival] = (destinationCounts[arrival] || 0) + 1;
      });

      const topDestinations = Object.entries(destinationCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, value]) => ({ name, value }));

      // Prochain départ
      const now = new Date();
      const prochain = tripsSnap.docs
        .map(doc => doc.data())
        .flatMap(trip => (trip.horaires || []).map((heure: string) => ({ ...trip, heure })))
        .filter(t => {
          const [h, m] = t.heure.split(':');
          const tripTime = new Date();
          tripTime.setHours(parseInt(h), parseInt(m), 0, 0);
          return tripTime > now;
        })
        .sort((a, b) => a.heure.localeCompare(b.heure))[0];

      setStats({
        ventes: reservationsSnap.size,
        totalEncaisse: totalRevenue,
        courriersEnvoyes: courriersEnvSnap.size,
        courriersRecus: courriersRecSnap.size,
        courriersEnAttente: courriersAttenteSnap.size,
        retards: retardsSnap.size,
        satisfaction: parseFloat(satisfactionAvg.toFixed(1)),
        occupation: parseFloat((occupationRate * 100).toFixed(1)),
        agents: usersSnap.docs.map(doc => ({
          id: doc.id,
          nom: doc.data().displayName || 'Inconnu',
          role: doc.data().role || 'agent',
          lastActive: doc.data().lastActive || 'Inconnu'
        })),
        topDestination: topDestinations[0]?.name || '—',
        prochainDepart: prochain ? `${prochain.departure || '?'} → ${prochain.arrival || '?'} à ${prochain.heure || '?'}` : '—',
        dailyStats: dailyStatsSnap.docs.map(doc => {
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
  };

  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
  }, [user, searchParams, dateRange]);

  const handleExport = () => {
    console.log("Export des données");
  };

  if (!user || !hasPermission(user.role as Role, 'reservations')) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 bg-white rounded-xl shadow-md max-w-md">
          <div className="text-red-500 text-5xl mb-4">⛔</div>
          <h2 className="text-xl font-bold mb-2">Accès refusé</h2>
          <p className="text-gray-600">Vous n'avez pas les permissions nécessaires pour accéder à ce tableau de bord.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement des données...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 bg-white rounded-xl shadow-md max-w-md">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold mb-2">Erreur de chargement</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => fetchStats(dateRange[0], dateRange[1])}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Tableau de bord</h1>
            <p className="text-gray-500">
              {user.agencyName} • Mis à jour à {new Date().toLocaleTimeString()}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-white p-2 rounded-lg shadow-xs border border-gray-200">
              <CalendarIcon className="h-5 w-5 text-gray-400" />
              <DatePicker
                selected={dateRange[0]}
                onChange={(date) => setDateRange([date as Date, dateRange[1]])}
                selectsStart
                startDate={dateRange[0]}
                endDate={dateRange[1]}
                className="w-28 border-none text-sm focus:ring-0"
                dateFormat="dd/MM"
              />
              <span className="text-gray-400">à</span>
              <DatePicker
                selected={dateRange[1]}
                onChange={(date) => setDateRange([dateRange[0], date as Date])}
                selectsEnd
                startDate={dateRange[0]}
                endDate={dateRange[1]}
                minDate={dateRange[0]}
                className="w-28 border-none text-sm focus:ring-0"
                dateFormat="dd/MM"
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExport}
              className="flex items-center justify-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-lg shadow-xs border border-gray-200 hover:bg-blue-50 transition"
            >
              <DocumentArrowDownIcon className="h-5 w-5" />
              <span className="hidden sm:inline">Exporter</span>
            </motion.button>
          </div>
        </div>

        {/* Cartes de statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            title="Billets vendus"
            value={stats.ventes}
            icon={<TicketIcon className="h-6 w-6" />}
            color="blue"
            link="/reservations"
          />
          <MetricCard
            title="Revenus totaux"
            value={stats.totalEncaisse}
            icon={<ChartBarIcon className="h-6 w-6" />}
            color="green"
            isCurrency
          />
          <MetricCard
            title="Courriers envoyés"
            value={stats.courriersEnvoyes}
            icon={<ArrowUpTrayIcon className="h-6 w-6" />}
            color="orange"
            link="/courriers?type=envoi"
          />
          <MetricCard
            title="Courriers reçus"
            value={stats.courriersRecus}
            icon={<ArrowDownTrayIcon className="h-6 w-6" />}
            color="purple"
            link="/courriers?type=retrait"
          />
          <MetricCard
            title="En attente"
            value={stats.courriersEnAttente}
            icon={<ClockIcon className="h-6 w-6" />}
            color="red"
            link="/courriers?statut=en_attente"
          />
          <MetricCard
            title="Agents actifs"
            value={stats.agents.length}
            icon={<UserGroupIcon className="h-6 w-6" />}
            color="indigo"
            link="/agents"
          />
          <MetricCard
            title="Taux d'occupation"
            value={stats.occupation}
            icon={<ChartBarIcon className="h-6 w-6" />}
            color="teal"
            unit="%"
          />
          <MetricCard
            title="Satisfaction"
            value={stats.satisfaction}
            icon={<ChartBarIcon className="h-6 w-6" />}
            color="amber"
            unit="/5"
          />
        </div>

        {/* Graphiques principaux */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Performance sur 7 jours</h3>
              <div className="flex gap-2">
                <button className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                  Revenus
                </button>
                <button className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                  Réservations
                </button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.dailyStats}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => [Number(value).toLocaleString(), 'Revenus (FCFA)']}
                  />
                  <Bar dataKey="revenus" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Destinations populaires</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.destinations}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {stats.destinations.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [value, 'réservations']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tableaux et listes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Prochain départ</h3>
              <MapPinIcon className="h-5 w-5 text-gray-400" />
            </div>
            <div className="text-center py-8">
              <p className="text-2xl font-bold text-gray-800">{stats.prochainDepart}</p>
              {stats.prochainDepart !== '—' && (
                <p className="text-gray-500 mt-2">Prochain départ programmé</p>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Agents actifs</h3>
              <span className="text-sm text-gray-500">{stats.agents.length} agents</span>
            </div>
            <div className="space-y-3">
              {stats.agents.map((agent) => {
                const displayName = agent.nom || 'Inconnu';
                const role = agent.role || 'Non défini';
                
                return (
                  <motion.div
                    key={agent.id}
                    whileHover={{ x: 2 }}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition"
                  >
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium">
                      {displayName.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{displayName}</p>
                      <p className="text-sm text-gray-500 capitalize">{role.toLowerCase()}</p>
                    </div>
                    <div className="text-sm text-gray-400">
                      {agent.lastActive || 'Inconnu'}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
  isCurrency?: boolean;
  unit?: string;
  link?: string;
}> = ({ title, value, icon, color = 'blue', isCurrency = false, unit = '', link }) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    orange: 'bg-orange-100 text-orange-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    teal: 'bg-teal-100 text-teal-600',
    amber: 'bg-amber-100 text-amber-600',
    gray: 'bg-gray-100 text-gray-600'
  };

  const content = (
    <motion.div
      whileHover={{ y: -2 }}
      className={`bg-white p-4 rounded-xl shadow-xs border border-gray-100 h-full ${link ? 'cursor-pointer' : ''}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">
            {isCurrency 
              ? `${Number(value).toLocaleString()} FCFA` 
              : typeof value === 'number' 
                ? `${value.toLocaleString()}${unit}` 
                : value}
          </p>
        </div>
        <div className={`p-2 rounded-lg ${colorClasses[color as keyof typeof colorClasses]}`}>
          {icon}
        </div>
      </div>
    </motion.div>
  );

  return link ? (
    <a href={link}>
      {content}
    </a>
  ) : content;
};

export default DashboardAgencePage;