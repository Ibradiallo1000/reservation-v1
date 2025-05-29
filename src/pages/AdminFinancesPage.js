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
import { CSVLink } from 'react-csv';
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, } from 'recharts';
const AdminFinancesPage = () => {
    const [reservations, setReservations] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [selectedCompany, setSelectedCompany] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            const snapshot = yield getDocs(collection(db, 'reservations'));
            const data = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            setReservations(data);
        });
        fetchData();
    }, []);
    useEffect(() => {
        const group = {};
        reservations.forEach(res => {
            var _a, _b;
            const date = ((_b = (_a = res.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date();
            const includeCompany = selectedCompany === 'all' || res.companyId === selectedCompany;
            const includeDate = (!startDate || new Date(startDate) <= date) &&
                (!endDate || date <= new Date(endDate));
            if (includeCompany && includeDate) {
                const companyId = res.companyId || 'inconnu';
                const companySlug = res.companySlug || '—';
                if (!group[companyId]) {
                    group[companyId] = { companyId, companySlug, total: 0, commission: 0 };
                }
                group[companyId].total += res.total || 0;
                group[companyId].commission += res.commission || 0;
            }
        });
        setFiltered(Object.values(group));
    }, [reservations, selectedCompany, startDate, endDate]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Finances - Vue globale" }), _jsxs("div", { className: "mb-6 flex flex-wrap gap-4 items-center", children: [_jsx("input", { type: "date", value: startDate, onChange: e => setStartDate(e.target.value), className: "border rounded px-2 py-1" }), _jsx("input", { type: "date", value: endDate, onChange: e => setEndDate(e.target.value), className: "border rounded px-2 py-1" }), _jsxs("select", { value: selectedCompany, onChange: e => setSelectedCompany(e.target.value), className: "border rounded px-2 py-1", children: [_jsx("option", { value: "all", children: "Toutes les compagnies" }), Array.from(new Set(reservations.map(r => r.companyId)))
                                .filter(Boolean)
                                .map((id, idx) => {
                                var _a;
                                return (_jsx("option", { value: id, children: ((_a = reservations.find(r => r.companyId === id)) === null || _a === void 0 ? void 0 : _a.companySlug) || id }, idx));
                            })] })] }), filtered.length > 0 && (_jsx("div", { className: "w-full h-[350px] mb-6 bg-white p-4 rounded shadow", children: _jsx(ResponsiveContainer, { width: "100%", height: "100%", children: _jsxs(BarChart, { data: filtered.map(f => ({
                            compagnie: f.companySlug,
                            total: f.total,
                            commission: f.commission,
                            benefice: f.total - f.commission,
                        })), children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "compagnie" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Bar, { dataKey: "total", fill: "#4F46E5", name: "Total" }), _jsx(Bar, { dataKey: "commission", fill: "#F59E0B", name: "Commission" }), _jsx(Bar, { dataKey: "benefice", fill: "#10B981", name: "B\u00E9n\u00E9fice net" })] }) }) })), filtered.length > 0 && (_jsx("div", { className: "mb-4", children: _jsx(CSVLink, { data: filtered.map(row => ({
                        Compagnie: row.companySlug,
                        Total: row.total,
                        Commission: row.commission,
                        Benefice: row.total - row.commission,
                    })), filename: `finances_${new Date().toISOString().slice(0, 10)}.csv`, className: "inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700", children: "Exporter en CSV" }) })), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full table-auto border", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border px-4 py-2", children: "Compagnie" }), _jsx("th", { className: "border px-4 py-2", children: "Total" }), _jsx("th", { className: "border px-4 py-2", children: "Commission" }), _jsx("th", { className: "border px-4 py-2", children: "B\u00E9n\u00E9fice net" })] }) }), _jsxs("tbody", { children: [filtered.map((entry, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border px-4 py-2", children: entry.companySlug }), _jsxs("td", { className: "border px-4 py-2", children: [entry.total.toLocaleString(), " FCFA"] }), _jsxs("td", { className: "border px-4 py-2", children: [entry.commission.toLocaleString(), " FCFA"] }), _jsxs("td", { className: "border px-4 py-2", children: [(entry.total - entry.commission).toLocaleString(), " FCFA"] })] }, i))), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "text-center p-4 text-gray-500", children: "Aucune donn\u00E9e trouv\u00E9e pour cette p\u00E9riode." }) }))] })] }) })] }));
};
export default AdminFinancesPage;
