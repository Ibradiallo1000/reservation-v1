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
// ✅ src/pages/CompagnieAgencesStatistiquesPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
const CompagnieAgencesStatistiquesPage = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const getStats = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setLoading(true);
        const agencesSnap = yield getDocs(query(collection(db, 'agences'), where('companyId', '==', user.companyId)));
        const agences = agencesSnap.docs.map(doc => ({ id: doc.id, ville: doc.data().ville }));
        const reservationsSnap = yield getDocs(query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé')));
        const grouped = {};
        agences.forEach(ag => {
            grouped[ag.id] = { id: ag.id, ville: ag.ville, totalReservations: 0, totalMontant: 0, totalPassagers: 0 };
        });
        reservationsSnap.docs.forEach(doc => {
            const data = doc.data();
            const aid = data.agencyId;
            if (grouped[aid]) {
                grouped[aid].totalReservations += 1;
                grouped[aid].totalMontant += data.montant || 0;
                grouped[aid].totalPassagers += data.seatsGo || 1;
            }
        });
        setStats(Object.values(grouped));
        setLoading(false);
    });
    const exportCSV = () => {
        const rows = [
            ['Agence', 'Billets vendus', 'Passagers', 'Montant total (FCFA)'],
            ...stats.map(s => [s.ville, s.totalReservations, s.totalPassagers, s.totalMontant])
        ];
        const csvContent = rows.map(e => e.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'statistiques_agences.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    useEffect(() => {
        getStats();
    }, []);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "Statistiques par Agence" }), _jsxs("div", { className: "flex justify-end gap-2 mb-4", children: [_jsx("button", { onClick: exportCSV, className: "bg-green-600 text-white px-4 py-2 rounded text-sm", children: "\uD83D\uDCE5 Export CSV" }), _jsx("button", { onClick: () => window.print(), className: "bg-blue-600 text-white px-4 py-2 rounded text-sm", children: "\uD83D\uDDA8\uFE0F Imprimer" })] }), loading ? (_jsx("p", { children: "Chargement..." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "overflow-x-auto mb-6", children: _jsxs("table", { className: "w-full border text-sm", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border px-3 py-2", children: "Agence" }), _jsx("th", { className: "border px-3 py-2", children: "R\u00E9servations" }), _jsx("th", { className: "border px-3 py-2", children: "Passagers" }), _jsx("th", { className: "border px-3 py-2", children: "Montant encaiss\u00E9 (FCFA)" })] }) }), _jsx("tbody", { children: stats.map((s) => (_jsxs("tr", { className: "text-center", children: [_jsx("td", { className: "border px-3 py-2", children: s.ville }), _jsx("td", { className: "border px-3 py-2", children: s.totalReservations }), _jsx("td", { className: "border px-3 py-2", children: s.totalPassagers }), _jsx("td", { className: "border px-3 py-2 font-semibold text-green-600", children: s.totalMontant.toLocaleString() })] }, s.id))) })] }) }), _jsxs("div", { className: "bg-white shadow p-4 rounded-lg", children: [_jsx("h2", { className: "text-lg font-semibold mb-4", children: "Visualisation graphique" }), _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(BarChart, { data: stats, margin: { top: 10, right: 30, left: 0, bottom: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "ville" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Bar, { dataKey: "totalMontant", fill: "#facc15", name: "Montant encaiss\u00E9" })] }) })] })] }))] }));
};
export default CompagnieAgencesStatistiquesPage;
