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
// ✅ src/pages/CompagnieVentesJournalieresPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
const CompagnieVentesJournalieresPage = () => {
    const { user } = useAuth();
    const [agences, setAgences] = useState([]);
    const [agencyId, setAgencyId] = useState('');
    const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [ventes, setVentes] = useState([]);
    const [loading, setLoading] = useState(false);
    const loadAgences = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
        const snap = yield getDocs(q);
        const list = snap.docs.map(doc => ({ id: doc.id, ville: doc.data().ville }));
        setAgences(list);
    });
    const fetchVentes = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedDate || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setLoading(true);
        const q = query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé'));
        const snap = yield getDocs(q);
        const list = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        const filtered = list.filter(v => v.date === selectedDate && (!agencyId || v.agencyId === agencyId));
        setVentes(filtered);
        setLoading(false);
    });
    useEffect(() => {
        loadAgences();
    }, []);
    useEffect(() => {
        fetchVentes();
    }, [selectedDate, agencyId]);
    const totalMontant = ventes.reduce((sum, v) => sum + (v.montant || 0), 0);
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCC5 Ventes journali\u00E8res par agence" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-6", children: [_jsx("input", { type: "date", value: selectedDate, onChange: e => setSelectedDate(e.target.value), className: "border p-2 rounded" }), _jsxs("select", { value: agencyId, onChange: e => setAgencyId(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "", children: "Toutes les agences" }), agences.map(a => _jsx("option", { value: a.id, children: a.ville }, a.id))] }), _jsx("button", { onClick: () => window.print(), className: "bg-blue-600 text-white px-4 py-2 rounded", children: "Imprimer" })] }), loading ? _jsx("p", { className: "text-gray-600", children: "Chargement..." }) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "text-right mb-2 font-semibold text-green-700", children: ["Total encaiss\u00E9 : ", totalMontant.toLocaleString(), " FCFA"] }), _jsxs("table", { className: "w-full text-sm border-collapse", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border p-2", children: "#" }), _jsx("th", { className: "border p-2", children: "Client" }), _jsx("th", { className: "border p-2", children: "T\u00E9l\u00E9phone" }), _jsx("th", { className: "border p-2", children: "Trajet" }), _jsx("th", { className: "border p-2", children: "Heure" }), _jsx("th", { className: "border p-2", children: "Montant" }), _jsx("th", { className: "border p-2", children: "Canal" })] }) }), _jsx("tbody", { children: ventes.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "text-center text-gray-500 p-4", children: "Aucune vente trouv\u00E9e." }) })) : (ventes.map((v, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border p-2 text-center", children: i + 1 }), _jsx("td", { className: "border p-2", children: v.nomClient }), _jsx("td", { className: "border p-2", children: v.telephone }), _jsxs("td", { className: "border p-2", children: [v.depart, " \u2192 ", v.arrivee] }), _jsx("td", { className: "border p-2 text-center", children: v.heure }), _jsx("td", { className: "border p-2 text-right", children: v.montant.toLocaleString() }), _jsx("td", { className: "border p-2 text-center", children: v.canal === 'guichet' ? 'Guichet' : 'En ligne' })] }, v.id)))) })] })] }))] }));
};
export default CompagnieVentesJournalieresPage;
