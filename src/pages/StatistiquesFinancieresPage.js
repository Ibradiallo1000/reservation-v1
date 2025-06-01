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
// ✅ src/pages/StatistiquesFinancieresPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, } from 'recharts';
const StatistiquesFinancieresPage = () => {
    const { user } = useAuth();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const moisLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.companyId))
                return;
            const recettesSnap = yield getDocs(query(collection(db, 'recettes'), where('companyId', '==', user.companyId)));
            const depensesSnap = yield getDocs(query(collection(db, 'depenses'), where('companyId', '==', user.companyId)));
            const stats = {};
            for (let i = 0; i < 12; i++) {
                stats[i] = {
                    mois: moisLabels[i],
                    recettes: 0,
                    depenses: 0,
                    solde: 0,
                };
            }
            recettesSnap.forEach(doc => {
                var _a, _b;
                const data = doc.data();
                const date = new Date(((_b = (_a = data.date) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || data.date);
                const mois = date.getMonth();
                stats[mois].recettes += data.montant || 0;
            });
            depensesSnap.forEach(doc => {
                var _a, _b;
                const data = doc.data();
                const date = new Date(((_b = (_a = data.date) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || data.date);
                const mois = date.getMonth();
                stats[mois].depenses += data.montant || 0;
            });
            for (let i = 0; i < 12; i++) {
                stats[i].solde = stats[i].recettes - stats[i].depenses;
            }
            setData(Object.values(stats));
            setLoading(false);
        });
        fetchData();
    }, [user]);
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCC8 Statistiques financi\u00E8res mensuelles" }), loading ? (_jsx("p", { className: "text-gray-600", children: "Chargement..." })) : (_jsx(ResponsiveContainer, { width: "100%", height: 400, children: _jsxs(BarChart, { data: data, margin: { top: 20, right: 30, left: 10, bottom: 5 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3" }), _jsx(XAxis, { dataKey: "mois" }), _jsx(YAxis, {}), _jsx(Tooltip, {}), _jsx(Legend, {}), _jsx(Bar, { dataKey: "recettes", fill: "#34d399", name: "Recettes" }), _jsx(Bar, { dataKey: "depenses", fill: "#f87171", name: "D\u00E9penses" }), _jsx(Bar, { dataKey: "solde", fill: "#facc15", name: "Solde" })] }) }))] }));
};
export default StatistiquesFinancieresPage;
