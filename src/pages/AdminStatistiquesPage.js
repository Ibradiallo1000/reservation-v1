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
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, LineChart, Line, } from 'recharts';
import { format } from 'date-fns';
const AdminStatistiquesPage = () => {
    const [reservations, setReservations] = useState([]);
    const [compagnies, setCompagnies] = useState([]);
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            const resSnapshot = yield getDocs(collection(db, 'reservations'));
            const compSnapshot = yield getDocs(collection(db, 'compagnies'));
            setReservations(resSnapshot.docs.map(doc => doc.data()));
            setCompagnies(compSnapshot.docs.map(doc => doc.data()));
        });
        fetchData();
    }, []);
    // Statistiques de base
    const totalReservations = reservations.length;
    const totalRevenue = reservations.reduce((sum, r) => sum + (r.total || 0), 0);
    const activeCompanies = compagnies.filter(c => c.status === 'actif').length;
    // Statistiques mensuelles (répartition par mois)
    const monthlyStats = {};
    reservations.forEach(r => {
        var _a, _b;
        const date = ((_b = (_a = r.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date();
        const month = format(date, 'yyyy-MM');
        if (!monthlyStats[month]) {
            monthlyStats[month] = { total: 0 };
        }
        monthlyStats[month].total += r.total || 0;
    });
    const monthlyData = Object.entries(monthlyStats).map(([month, data]) => ({
        month,
        total: data.total,
    })).sort((a, b) => a.month.localeCompare(b.month));
    // Top compagnies par CA
    const companyStats = {};
    reservations.forEach(r => {
        var _a;
        const company = ((_a = r.trip) === null || _a === void 0 ? void 0 : _a.company) || 'Inconnue';
        companyStats[company] = (companyStats[company] || 0) + (r.total || 0);
    });
    const topCompanies = Object.entries(companyStats)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Statistiques g\u00E9n\u00E9rales" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8", children: [_jsxs("div", { className: "bg-white rounded shadow p-4 text-center", children: [_jsx("h2", { className: "text-xl font-semibold", children: "R\u00E9servations" }), _jsx("p", { className: "text-3xl font-bold text-blue-600", children: totalReservations })] }), _jsxs("div", { className: "bg-white rounded shadow p-4 text-center", children: [_jsx("h2", { className: "text-xl font-semibold", children: "Revenus totaux" }), _jsxs("p", { className: "text-3xl font-bold text-green-600", children: [totalRevenue.toLocaleString(), " FCFA"] })] }), _jsxs("div", { className: "bg-white rounded shadow p-4 text-center", children: [_jsx("h2", { className: "text-xl font-semibold", children: "Compagnies actives" }), _jsx("p", { className: "text-3xl font-bold text-indigo-600", children: activeCompanies })] })] }), _jsxs("div", { className: "mb-10", children: [_jsx("h2", { className: "text-lg font-semibold mb-2", children: "\u00C9volution des revenus par mois" }), _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(LineChart, { data: monthlyData, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "month" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Line, { type: "monotone", dataKey: "total", stroke: "#10B981", name: "Revenus" })] }) })] }), _jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold mb-2", children: "Top 5 compagnies par revenus" }), _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(BarChart, { data: topCompanies, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "name" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Bar, { dataKey: "total", fill: "#6366F1", name: "CA total" })] }) })] })] }));
};
export default AdminStatistiquesPage;
