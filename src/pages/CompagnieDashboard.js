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
// src/pages/DashboardCompagnie.tsx
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BuildingOfficeIcon } from '@heroicons/react/24/outline';
import DateRangePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
const DashboardCompagnie = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dateRange, setDateRange] = useState([
        new Date(new Date().setDate(new Date().getDate() - 30)),
        new Date()
    ]);
    const [agenciesStats, setAgenciesStats] = useState([]);
    const [globalStats, setGlobalStats] = useState({
        totalAgencies: 0,
        totalReservations: 0,
        totalRevenue: 0,
        totalCouriers: 0,
        growthRate: 0,
    });
    const fetchAgencies = (companyId) => __awaiter(void 0, void 0, void 0, function* () {
        const agenciesQuery = query(collection(db, 'agences'), where('companyId', '==', companyId));
        const snapshot = yield getDocs(agenciesQuery);
        return snapshot.docs.map(doc => ({
            id: doc.id,
            nom: doc.data().nom,
            ville: doc.data().ville,
            companyId: doc.data().companyId,
            statut: doc.data().statut
        }));
    });
    const fetchAgencyStats = (agency) => __awaiter(void 0, void 0, void 0, function* () {
        const [startDate, endDate] = dateRange;
        const [reservationsSnap, courriersSnap] = yield Promise.all([
            getDocs(query(collection(db, 'reservations'), where('agencyId', '==', agency.id), where('createdAt', '>=', Timestamp.fromDate(startDate)), where('createdAt', '<=', Timestamp.fromDate(endDate)))),
            getDocs(query(collection(db, 'courriers'), where('agencyId', '==', agency.id), where('createdAt', '>=', Timestamp.fromDate(startDate)), where('createdAt', '<=', Timestamp.fromDate(endDate))))
        ]);
        return {
            reservations: reservationsSnap.size,
            revenus: reservationsSnap.docs.reduce((sum, doc) => sum + (doc.data().prixTotal || 0), 0),
            courriers: courriersSnap.size
        };
    });
    const calculateGrowthRate = (agencies) => {
        if (agencies.length === 0)
            return 0;
        const totalRevenue = agencies.reduce((sum, a) => sum + a.revenus, 0);
        const avgRevenue = totalRevenue / agencies.length;
        return parseFloat((avgRevenue * 0.1).toFixed(2)); // 10% de croissance fictive pour l'exemple
    };
    useEffect(() => {
        const loadData = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                if (!(user === null || user === void 0 ? void 0 : user.companyId))
                    return;
                setLoading(true);
                setError(null);
                const agencies = yield fetchAgencies(user.companyId);
                const stats = yield Promise.all(agencies.map((agency) => __awaiter(void 0, void 0, void 0, function* () {
                    return (Object.assign(Object.assign({}, agency), (yield fetchAgencyStats(agency))));
                })));
                const totals = stats.reduce((acc, curr) => ({
                    totalReservations: acc.totalReservations + curr.reservations,
                    totalRevenue: acc.totalRevenue + curr.revenus,
                    totalCouriers: acc.totalCouriers + curr.courriers,
                }), { totalReservations: 0, totalRevenue: 0, totalCouriers: 0 });
                setAgenciesStats(stats);
                setGlobalStats(Object.assign(Object.assign({ totalAgencies: agencies.length }, totals), { growthRate: calculateGrowthRate(stats) }));
            }
            catch (err) {
                console.error("Erreur:", err);
                setError("Erreur de chargement des données");
            }
            finally {
                setLoading(false);
            }
        });
        loadData();
    }, [user, dateRange]);
    if (loading)
        return _jsx("div", { className: "p-6 text-center", children: "Chargement en cours..." });
    if (error)
        return _jsx("div", { className: "p-6 text-red-500", children: error });
    return (_jsxs("div", { className: "p-6 space-y-8", children: [_jsxs("div", { className: "flex flex-col md:flex-row justify-between items-start gap-4", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold", children: "Dashboard Compagnie" }), _jsxs("p", { className: "text-gray-600", children: ["Donn\u00E9es du ", dateRange[0].toLocaleDateString(), " au ", dateRange[1].toLocaleDateString()] })] }), _jsx(DateRangePicker, { selectsRange: true, startDate: dateRange[0], endDate: dateRange[1], onChange: (update) => {
                            setDateRange(update);
                        }, className: "border rounded p-2" })] }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx(StatCard, { title: "Agences", value: globalStats.totalAgencies, icon: _jsx(BuildingOfficeIcon, { className: "h-5 w-5 text-blue-500" }) }), _jsx(StatCard, { title: "R\u00E9servations", value: globalStats.totalReservations, trend: `${globalStats.growthRate >= 0 ? '+' : ''}${globalStats.growthRate}%` }), _jsx(StatCard, { title: "Revenus", value: globalStats.totalRevenue, isCurrency: true }), _jsx(StatCard, { title: "Courriers", value: globalStats.totalCouriers })] }), _jsxs("div", { className: "bg-white p-6 rounded-lg shadow", children: [_jsx("h3", { className: "font-semibold text-lg mb-4", children: "Performance par agence" }), _jsx("div", { className: "h-80", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: agenciesStats, children: [_jsx(XAxis, { dataKey: "nom" }), _jsx(YAxis, {}), _jsx(Tooltip, { formatter: (value) => [Number(value).toLocaleString(), 'Revenus (FCFA)'], labelFormatter: (label) => `Agence: ${label}` }), _jsx(Bar, { dataKey: "revenus", name: "Revenus", fill: "#6366f1", radius: [4, 4, 0, 0] })] }) }) })] }), _jsx("div", { className: "overflow-x-auto bg-white rounded-lg shadow", children: _jsxs("table", { className: "min-w-full divide-y divide-gray-200", children: [_jsx("thead", { className: "bg-gray-50", children: _jsxs("tr", { children: [_jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Agence" }), _jsx("th", { className: "px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Ville" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider", children: "R\u00E9servations" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Revenus" }), _jsx("th", { className: "px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider", children: "Courriers" })] }) }), _jsx("tbody", { className: "bg-white divide-y divide-gray-200", children: agenciesStats.map((agency) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900", children: agency.nom }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap text-sm text-gray-500", children: agency.ville }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right", children: agency.reservations.toLocaleString() }), _jsxs("td", { className: "px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right", children: [agency.revenus.toLocaleString(), " FCFA"] }), _jsx("td", { className: "px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right", children: agency.courriers.toLocaleString() })] }, agency.id))) })] }) })] }));
};
// Composant StatCard
const StatCard = ({ title, value, icon, trend, isCurrency = false }) => (_jsxs("div", { className: "bg-white p-4 rounded-lg border border-gray-200 shadow-sm", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("p", { className: "text-sm font-medium text-gray-500", children: title }), icon] }), _jsxs("div", { className: "mt-2 flex items-baseline", children: [_jsx("p", { className: "text-2xl font-semibold", children: isCurrency ? `${value.toLocaleString()} FCFA` : value.toLocaleString() }), trend && (_jsx("span", { className: `ml-2 text-sm ${trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}`, children: trend }))] })] }));
export default DashboardCompagnie;
