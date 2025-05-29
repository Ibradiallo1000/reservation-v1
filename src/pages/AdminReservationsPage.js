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
const AdminReservationsPage = () => {
    const [stats, setStats] = useState([]);
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            const snapshot = yield getDocs(collection(db, 'reservations'));
            const data = snapshot.docs.map(doc => {
                var _a, _b;
                const d = doc.data();
                return {
                    companySlug: ((_a = d.trip) === null || _a === void 0 ? void 0 : _a.company) || '—',
                    date: ((_b = d.trip) === null || _b === void 0 ? void 0 : _b.date) || '',
                    status: d.status || 'payée',
                    total: d.total || 0,
                };
            });
            const grouped = {};
            data.forEach((r) => {
                const company = r.companySlug;
                if (!grouped[company]) {
                    grouped[company] = {
                        company,
                        totalReservations: 0,
                        totalAmount: 0,
                        byStatus: {},
                    };
                }
                grouped[company].totalReservations++;
                grouped[company].totalAmount += r.total;
                grouped[company].byStatus[r.status] = (grouped[company].byStatus[r.status] || 0) + 1;
            });
            setStats(Object.values(grouped));
        });
        fetchData();
    }, []);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Statistiques des R\u00E9servations" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full table-auto border", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border px-4 py-2", children: "Compagnie" }), _jsx("th", { className: "border px-4 py-2", children: "Nombre total" }), _jsx("th", { className: "border px-4 py-2", children: "Montant total" }), _jsx("th", { className: "border px-4 py-2", children: "Statuts" })] }) }), _jsxs("tbody", { children: [stats.map((s, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border px-4 py-2 font-semibold", children: s.company }), _jsx("td", { className: "border px-4 py-2 text-center", children: s.totalReservations }), _jsxs("td", { className: "border px-4 py-2", children: [s.totalAmount.toLocaleString(), " FCFA"] }), _jsx("td", { className: "border px-4 py-2", children: Object.entries(s.byStatus).map(([status, count]) => (_jsxs("p", { children: [status, " : ", count] }, status))) })] }, i))), stats.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "text-center p-4 text-gray-500", children: "Aucune donn\u00E9e disponible." }) }))] })] }) })] }));
};
export default AdminReservationsPage;
