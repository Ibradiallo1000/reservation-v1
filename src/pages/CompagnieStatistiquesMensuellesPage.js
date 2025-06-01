var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, } from 'recharts';
const CompagnieStatistiquesMensuellesPage = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const mois = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    useEffect(() => {
        const fetchStats = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.companyId))
                return;
            const resQuery = query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé'));
            const resSnap = yield getDocs(resQuery);
            const grouped = {};
            resSnap.docs.forEach((doc) => {
                var _a, _b;
                const data = doc.data();
                const date = (_b = (_a = data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
                if (!date)
                    return;
                const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                const label = `${mois[date.getMonth()]} ${date.getFullYear()}`;
                if (!grouped[monthKey]) {
                    grouped[monthKey] = {
                        month: label,
                        totalReservations: 0,
                        totalPassagers: 0,
                        totalMontant: 0,
                    };
                }
                grouped[monthKey].totalReservations += 1;
                grouped[monthKey].totalPassagers += data.seatsGo || 1;
                grouped[monthKey].totalMontant += data.montant || 0;
            });
            const result = Object.entries(grouped)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([, value]) => value);
            setStats(result);
            setLoading(false);
        });
        fetchStats();
    }, [user]);
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCC5 Statistiques mensuelles" }), loading ? (_jsx("p", { children: "Chargement des donn\u00E9es..." })) : (_jsxs(_Fragment, { children: [_jsxs("table", { className: "w-full border text-sm mb-8", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border px-3 py-2", children: "Mois" }), _jsx("th", { className: "border px-3 py-2", children: "R\u00E9servations" }), _jsx("th", { className: "border px-3 py-2", children: "Passagers" }), _jsx("th", { className: "border px-3 py-2", children: "Montant encaiss\u00E9 (FCFA)" })] }) }), _jsx("tbody", { children: stats.map((s, i) => (_jsxs("tr", { className: "text-center", children: [_jsx("td", { className: "border px-3 py-2", children: s.month }), _jsx("td", { className: "border px-3 py-2", children: s.totalReservations }), _jsx("td", { className: "border px-3 py-2", children: s.totalPassagers }), _jsx("td", { className: "border px-3 py-2 text-green-600 font-semibold", children: s.totalMontant.toLocaleString() })] }, i))) })] }), _jsxs("div", { className: "bg-white shadow p-4 rounded-lg", children: [_jsx("h2", { className: "text-lg font-semibold mb-4", children: "\uD83D\uDCCA Graphique des revenus par mois" }), _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(BarChart, { data: stats, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "month" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "totalMontant", fill: "#34d399", name: "Montant encaiss\u00E9" })] }) })] })] }))] }));
};
export default CompagnieStatistiquesMensuellesPage;
