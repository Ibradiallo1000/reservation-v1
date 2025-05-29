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
import { CSVLink } from 'react-csv';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
const AdminVentesPage = () => {
    const [reservations, setReservations] = useState([]);
    const [grouped, setGrouped] = useState([]);
    const [selectedVille, setSelectedVille] = useState('all');
    const [selectedCompany, setSelectedCompany] = useState('all');
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            const resSnapshot = yield getDocs(collection(db, 'reservations'));
            setReservations(resSnapshot.docs.map(doc => doc.data()));
        });
        fetchData();
    }, []);
    useEffect(() => {
        const group = {};
        reservations.forEach(r => {
            var _a, _b;
            const ville = ((_a = r.trip) === null || _a === void 0 ? void 0 : _a.departure) || '—';
            const company = ((_b = r.trip) === null || _b === void 0 ? void 0 : _b.company) || '';
            if ((selectedVille === 'all' || ville === selectedVille) &&
                (selectedCompany === 'all' || company === selectedCompany)) {
                if (!group[ville]) {
                    group[ville] = { ville, total: 0, billets: 0, commission: 0 };
                }
                group[ville].total += r.total || 0;
                group[ville].billets += (r.seatsGo || 0) + (r.seatsReturn || 0);
                group[ville].commission += r.commission || 0;
            }
        });
        setGrouped(Object.values(group));
    }, [reservations, selectedVille, selectedCompany]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Historique des ventes" }), _jsxs("div", { className: "mb-6 flex flex-wrap gap-4 items-center", children: [_jsxs("select", { value: selectedVille, onChange: e => setSelectedVille(e.target.value), className: "border rounded px-2 py-1", children: [_jsx("option", { value: "all", children: "Toutes les villes" }), Array.from(new Set(reservations.map(r => { var _a; return (_a = r.trip) === null || _a === void 0 ? void 0 : _a.departure; })))
                                .filter(Boolean)
                                .map((v, idx) => (_jsx("option", { value: v, children: v }, idx)))] }), _jsxs("select", { value: selectedCompany, onChange: e => setSelectedCompany(e.target.value), className: "border rounded px-2 py-1", children: [_jsx("option", { value: "all", children: "Toutes les compagnies" }), Array.from(new Set(reservations.map(r => { var _a; return (_a = r.trip) === null || _a === void 0 ? void 0 : _a.company; })))
                                .filter(Boolean)
                                .map((c, idx) => (_jsx("option", { value: c, children: c }, idx)))] }), grouped.length > 0 && (_jsx(CSVLink, { data: grouped.map(row => ({
                            Ville: row.ville,
                            Billets: row.billets,
                            Total: row.total,
                            Commission: row.commission,
                            Benefice: row.total - row.commission
                        })), filename: `ventes_${new Date().toISOString().slice(0, 10)}.csv`, className: "bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700", children: "Exporter CSV" }))] }), grouped.length > 0 && (_jsxs("div", { className: "mb-8", children: [_jsx("h2", { className: "text-lg font-semibold mb-2", children: "Graphique comparatif par ville" }), _jsx(ResponsiveContainer, { width: "100%", height: 300, children: _jsxs(BarChart, { data: grouped, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "ville" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Bar, { dataKey: "total", fill: "#4F46E5", name: "Total" }), _jsx(Bar, { dataKey: "commission", fill: "#F59E0B", name: "Commission" }), _jsx(Bar, { dataKey: (entry) => entry.total - entry.commission, fill: "#10B981", name: "B\u00E9n\u00E9fice" })] }) })] })), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full table-auto border", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border px-4 py-2", children: "Ville" }), _jsx("th", { className: "border px-4 py-2", children: "Nombre de billets" }), _jsx("th", { className: "border px-4 py-2", children: "Total encaiss\u00E9" }), _jsx("th", { className: "border px-4 py-2", children: "Commission" }), _jsx("th", { className: "border px-4 py-2", children: "B\u00E9n\u00E9fice net" })] }) }), _jsxs("tbody", { children: [grouped.map((v, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border px-4 py-2", children: v.ville }), _jsx("td", { className: "border px-4 py-2", children: v.billets }), _jsxs("td", { className: "border px-4 py-2", children: [v.total.toLocaleString(), " FCFA"] }), _jsxs("td", { className: "border px-4 py-2", children: [v.commission.toLocaleString(), " FCFA"] }), _jsxs("td", { className: "border px-4 py-2", children: [(v.total - v.commission).toLocaleString(), " FCFA"] })] }, i))), grouped.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "text-center p-4 text-gray-500", children: "Aucune donn\u00E9e disponible." }) }))] })] }) })] }));
};
export default AdminVentesPage;
