var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { hasPermission } from '../roles-permissions';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { motion } from 'framer-motion';
import { DocumentArrowDownIcon, ChartBarIcon, UserGroupIcon, TicketIcon, ArrowUpTrayIcon, ArrowDownTrayIcon, ClockIcon, MapPinIcon, CalendarIcon } from '@heroicons/react/24/outline';
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];
const DashboardAgencePage = () => {
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const [dateRange, setDateRange] = useState([
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
        agents: [],
        topDestination: '',
        prochainDepart: '',
        dailyStats: [],
        destinations: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const fetchStats = (startDate, endDate) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const agencyIdFromQuery = searchParams.get('aid');
        const agencyId = agencyIdFromQuery || (user === null || user === void 0 ? void 0 : user.agencyId);
        if (!agencyId)
            return;
        setLoading(true);
        setError(null);
        try {
            const startTimestamp = Timestamp.fromDate(startDate);
            const endTimestamp = Timestamp.fromDate(endDate);
            const [reservationsSnap, courriersEnvSnap, courriersRecSnap, courriersAttenteSnap, retardsSnap, satisfactionSnap, occupationSnap, usersSnap, tripsSnap, dailyStatsSnap, destinationsSnap] = yield Promise.all([
                getDocs(query(collection(db, 'reservations'), where('agencyId', '==', agencyId), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp))),
                getDocs(query(collection(db, 'courriers'), where('agencyId', '==', agencyId), where('type', '==', 'envoi'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp))),
                getDocs(query(collection(db, 'courriers'), where('agencyId', '==', agencyId), where('type', '==', 'retrait'), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp))),
                getDocs(query(collection(db, 'courriers'), where('agencyId', '==', agencyId), where('statut', '==', 'en_attente'))),
                getDocs(query(collection(db, 'trips'), where('agencyId', '==', agencyId), where('statut', '==', 'retard'))),
                getDocs(query(collection(db, 'feedback'), where('agencyId', '==', agencyId), where('createdAt', '>=', startTimestamp), where('createdAt', '<=', endTimestamp))),
                getDocs(query(collection(db, 'vehicles'), where('agencyId', '==', agencyId))),
                getDocs(query(collection(db, 'users'), where('agencyId', '==', agencyId))),
                getDocs(query(collection(db, 'dailyTrips'), where('agencyId', '==', agencyId), where('date', '==', new Date().toISOString().split('T')[0]))),
                getDocs(query(collection(db, 'dailyStats'), where('agencyId', '==', agencyId), where('date', '>=', Timestamp.fromDate(new Date(new Date().setDate(new Date().getDate() - 7)))), where('date', '<=', Timestamp.fromDate(new Date())))),
                getDocs(query(collection(db, 'destinations'), where('agencyId', '==', agencyId)))
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
            const destinationCounts = {};
            reservationsSnap.docs.forEach(doc => {
                const arrival = doc.data().arrival;
                if (arrival)
                    destinationCounts[arrival] = (destinationCounts[arrival] || 0) + 1;
            });
            const topDestinations = Object.entries(destinationCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([name, value]) => ({ name, value }));
            // Prochain départ
            const now = new Date();
            const prochain = tripsSnap.docs
                .map(doc => doc.data())
                .flatMap(trip => (trip.horaires || []).map((heure) => (Object.assign(Object.assign({}, trip), { heure }))))
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
                topDestination: ((_a = topDestinations[0]) === null || _a === void 0 ? void 0 : _a.name) || '—',
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
        }
        catch (err) {
            console.error("Erreur:", err);
            setError("Une erreur est survenue lors du chargement des données");
        }
        finally {
            setLoading(false);
        }
    });
    useEffect(() => {
        fetchStats(dateRange[0], dateRange[1]);
    }, [user, searchParams, dateRange]);
    const handleExport = () => {
        console.log("Export des données");
    };
    if (!user || !hasPermission(user.role, 'reservations')) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-gray-50", children: _jsxs("div", { className: "text-center p-6 bg-white rounded-xl shadow-md max-w-md", children: [_jsx("div", { className: "text-red-500 text-5xl mb-4", children: "\u26D4" }), _jsx("h2", { className: "text-xl font-bold mb-2", children: "Acc\u00E8s refus\u00E9" }), _jsx("p", { className: "text-gray-600", children: "Vous n'avez pas les permissions n\u00E9cessaires pour acc\u00E9der \u00E0 ce tableau de bord." })] }) }));
    }
    if (loading) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-gray-50", children: _jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" }), _jsx("p", { className: "mt-4 text-gray-600", children: "Chargement des donn\u00E9es..." })] }) }));
    }
    if (error) {
        return (_jsx("div", { className: "flex items-center justify-center min-h-screen bg-gray-50", children: _jsxs("div", { className: "text-center p-6 bg-white rounded-xl shadow-md max-w-md", children: [_jsx("div", { className: "text-red-500 text-5xl mb-4", children: "\u26A0\uFE0F" }), _jsx("h2", { className: "text-xl font-bold mb-2", children: "Erreur de chargement" }), _jsx("p", { className: "text-gray-600 mb-4", children: error }), _jsx("button", { onClick: () => fetchStats(dateRange[0], dateRange[1]), className: "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition", children: "R\u00E9essayer" })] }) }));
    }
    return (_jsx("div", { className: "min-h-screen bg-gray-50 p-4 md:p-6", children: _jsxs("div", { className: "max-w-7xl mx-auto", children: [_jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl md:text-3xl font-bold text-gray-900", children: "Tableau de bord" }), _jsxs("p", { className: "text-gray-500", children: [user.agencyName, " \u2022 Mis \u00E0 jour \u00E0 ", new Date().toLocaleTimeString()] })] }), _jsxs("div", { className: "flex flex-col sm:flex-row gap-3 w-full md:w-auto", children: [_jsxs("div", { className: "flex items-center gap-2 bg-white p-2 rounded-lg shadow-xs border border-gray-200", children: [_jsx(CalendarIcon, { className: "h-5 w-5 text-gray-400" }), _jsx(DatePicker, { selected: dateRange[0], onChange: (date) => setDateRange([date, dateRange[1]]), selectsStart: true, startDate: dateRange[0], endDate: dateRange[1], className: "w-28 border-none text-sm focus:ring-0", dateFormat: "dd/MM" }), _jsx("span", { className: "text-gray-400", children: "\u00E0" }), _jsx(DatePicker, { selected: dateRange[1], onChange: (date) => setDateRange([dateRange[0], date]), selectsEnd: true, startDate: dateRange[0], endDate: dateRange[1], minDate: dateRange[0], className: "w-28 border-none text-sm focus:ring-0", dateFormat: "dd/MM" })] }), _jsxs(motion.button, { whileHover: { scale: 1.02 }, whileTap: { scale: 0.98 }, onClick: handleExport, className: "flex items-center justify-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-lg shadow-xs border border-gray-200 hover:bg-blue-50 transition", children: [_jsx(DocumentArrowDownIcon, { className: "h-5 w-5" }), _jsx("span", { className: "hidden sm:inline", children: "Exporter" })] })] })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6", children: [_jsx(MetricCard, { title: "Billets vendus", value: stats.ventes, icon: _jsx(TicketIcon, { className: "h-6 w-6" }), color: "blue", link: "/reservations" }), _jsx(MetricCard, { title: "Revenus totaux", value: stats.totalEncaisse, icon: _jsx(ChartBarIcon, { className: "h-6 w-6" }), color: "green", isCurrency: true }), _jsx(MetricCard, { title: "Courriers envoy\u00E9s", value: stats.courriersEnvoyes, icon: _jsx(ArrowUpTrayIcon, { className: "h-6 w-6" }), color: "orange", link: "/courriers?type=envoi" }), _jsx(MetricCard, { title: "Courriers re\u00E7us", value: stats.courriersRecus, icon: _jsx(ArrowDownTrayIcon, { className: "h-6 w-6" }), color: "purple", link: "/courriers?type=retrait" }), _jsx(MetricCard, { title: "En attente", value: stats.courriersEnAttente, icon: _jsx(ClockIcon, { className: "h-6 w-6" }), color: "red", link: "/courriers?statut=en_attente" }), _jsx(MetricCard, { title: "Agents actifs", value: stats.agents.length, icon: _jsx(UserGroupIcon, { className: "h-6 w-6" }), color: "indigo", link: "/agents" }), _jsx(MetricCard, { title: "Taux d'occupation", value: stats.occupation, icon: _jsx(ChartBarIcon, { className: "h-6 w-6" }), color: "teal", unit: "%" }), _jsx(MetricCard, { title: "Satisfaction", value: stats.satisfaction, icon: _jsx(ChartBarIcon, { className: "h-6 w-6" }), color: "amber", unit: "/5" })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6", children: [_jsxs("div", { className: "lg:col-span-2 bg-white p-5 rounded-xl shadow-xs border border-gray-100", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Performance sur 7 jours" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { className: "text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded", children: "Revenus" }), _jsx("button", { className: "text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded", children: "R\u00E9servations" })] })] }), _jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: stats.dailyStats, children: [_jsx(XAxis, { dataKey: "date" }), _jsx(YAxis, {}), _jsx(Tooltip, { formatter: (value) => [Number(value).toLocaleString(), 'Revenus (FCFA)'] }), _jsx(Bar, { dataKey: "revenus", fill: "#4f46e5", radius: [4, 4, 0, 0] })] }) }) })] }), _jsxs("div", { className: "bg-white p-5 rounded-xl shadow-xs border border-gray-100", children: [_jsx("h3", { className: "text-lg font-semibold mb-4", children: "Destinations populaires" }), _jsx("div", { className: "h-64", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(PieChart, { children: [_jsx(Pie, { data: stats.destinations, cx: "50%", cy: "50%", labelLine: false, outerRadius: 80, fill: "#8884d8", dataKey: "value", label: ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`, children: stats.destinations.map((entry, index) => (_jsx(Cell, { fill: COLORS[index % COLORS.length] }, `cell-${index}`))) }), _jsx(Tooltip, { formatter: (value) => [value, 'réservations'] })] }) }) })] })] }), _jsxs("div", { className: "grid grid-cols-1 lg:grid-cols-2 gap-6", children: [_jsxs("div", { className: "bg-white p-5 rounded-xl shadow-xs border border-gray-100", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Prochain d\u00E9part" }), _jsx(MapPinIcon, { className: "h-5 w-5 text-gray-400" })] }), _jsxs("div", { className: "text-center py-8", children: [_jsx("p", { className: "text-2xl font-bold text-gray-800", children: stats.prochainDepart }), stats.prochainDepart !== '—' && (_jsx("p", { className: "text-gray-500 mt-2", children: "Prochain d\u00E9part programm\u00E9" }))] })] }), _jsxs("div", { className: "bg-white p-5 rounded-xl shadow-xs border border-gray-100", children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h3", { className: "text-lg font-semibold", children: "Agents actifs" }), _jsxs("span", { className: "text-sm text-gray-500", children: [stats.agents.length, " agents"] })] }), _jsx("div", { className: "space-y-3", children: stats.agents.map((agent) => {
                                        const displayName = agent.nom || 'Inconnu';
                                        const role = agent.role || 'Non défini';
                                        return (_jsxs(motion.div, { whileHover: { x: 2 }, className: "flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg transition", children: [_jsx("div", { className: "h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-medium", children: displayName.charAt(0) }), _jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "font-medium", children: displayName }), _jsx("p", { className: "text-sm text-gray-500 capitalize", children: role.toLowerCase() })] }), _jsx("div", { className: "text-sm text-gray-400", children: agent.lastActive || 'Inconnu' })] }, agent.id));
                                    }) })] })] })] }) }));
};
const MetricCard = ({ title, value, icon, color = 'blue', isCurrency = false, unit = '', link }) => {
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
    const content = (_jsx(motion.div, { whileHover: { y: -2 }, className: `bg-white p-4 rounded-xl shadow-xs border border-gray-100 h-full ${link ? 'cursor-pointer' : ''}`, children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium text-gray-500", children: title }), _jsx("p", { className: "text-2xl font-bold text-gray-800 mt-1", children: isCurrency
                                ? `${Number(value).toLocaleString()} FCFA`
                                : typeof value === 'number'
                                    ? `${value.toLocaleString()}${unit}`
                                    : value })] }), _jsx("div", { className: `p-2 rounded-lg ${colorClasses[color]}`, children: icon })] }) }));
    return link ? (_jsx("a", { href: link, children: content })) : content;
};
export default DashboardAgencePage;
