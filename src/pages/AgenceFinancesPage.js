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
// ✅ Fichier : src/pages/AgenceFinancesPage.tsx
import { useEffect, useState } from 'react';
import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const AgenceFinancesPage = () => {
    const { user } = useAuth();
    const [periode, setPeriode] = useState('jour');
    const [revenu, setRevenu] = useState(0);
    const [nombre, setNombre] = useState(0);
    const getStartDate = () => {
        const now = new Date();
        switch (periode) {
            case 'semaine':
                now.setDate(now.getDate() - 7);
                break;
            case 'mois':
                now.setDate(now.getDate() - 30);
                break;
            default:
                now.setHours(0, 0, 0, 0);
        }
        return Timestamp.fromDate(now);
    };
    const fetchStats = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        const start = getStartDate();
        const q = query(collection(db, 'reservations'), where('agencyId', '==', user.agencyId), where('createdAt', '>=', start));
        const snap = yield getDocs(q);
        const total = snap.docs.reduce((sum, doc) => sum + (doc.data().prixTotal || 0), 0);
        setRevenu(total);
        setNombre(snap.size);
    });
    useEffect(() => {
        fetchStats();
    }, [periode, user]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "\u00C9tat financier de l\u2019agence" }), _jsxs("div", { className: "flex gap-4 mb-4", children: [_jsx("button", { className: `px-4 py-2 rounded ${periode === 'jour' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`, onClick: () => setPeriode('jour'), children: "Aujourd\u2019hui" }), _jsx("button", { className: `px-4 py-2 rounded ${periode === 'semaine' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`, onClick: () => setPeriode('semaine'), children: "7 derniers jours" }), _jsx("button", { className: `px-4 py-2 rounded ${periode === 'mois' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`, onClick: () => setPeriode('mois'), children: "Ce mois-ci" })] }), _jsxs("div", { className: "bg-white p-6 rounded shadow border", children: [_jsxs("p", { className: "text-lg", children: ["Revenu total : ", _jsxs("span", { className: "font-bold text-green-700", children: [revenu, " FCFA"] })] }), _jsxs("p", { className: "text-lg", children: ["Nombre de r\u00E9servations : ", _jsx("span", { className: "font-bold text-blue-700", children: nombre })] })] }), _jsx("div", { className: "mt-4", children: _jsx("button", { onClick: () => window.print(), className: "bg-indigo-600 text-white px-4 py-2 rounded", children: "Imprimer le r\u00E9sum\u00E9" }) })] }));
};
export default AgenceFinancesPage;
