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
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const AgenceDepensesPage = () => {
    const { user } = useAuth();
    const [libelle, setLibelle] = useState('');
    const [montant, setMontant] = useState(0);
    const [type, setType] = useState('autre');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [depenses, setDepenses] = useState([]);
    const fetchDepenses = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        const q = query(collection(db, 'depenses'), where('agencyId', '==', user.agencyId));
        const snapshot = yield getDocs(q);
        const list = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setDepenses(list.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds));
    });
    const handleAdd = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        try {
            yield addDoc(collection(db, 'depenses'), {
                libelle,
                montant,
                type,
                date,
                agencyId: user.agencyId,
                createdAt: Timestamp.now(),
            });
            setLibelle('');
            setMontant(0);
            setType('autre');
            setDate(new Date().toISOString().split('T')[0]);
            fetchDepenses();
        }
        catch (err) {
            alert("Erreur lors de l'enregistrement.");
        }
    });
    useEffect(() => {
        fetchDepenses();
    }, [user]);
    const total = depenses.reduce((sum, d) => sum + d.montant, 0);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "D\u00E9penses de l'agence" }), _jsxs("form", { onSubmit: handleAdd, className: "grid md:grid-cols-2 gap-4 mb-6", children: [_jsx("input", { value: libelle, onChange: (e) => setLibelle(e.target.value), placeholder: "Libell\u00E9", className: "border p-2 rounded", required: true }), _jsx("input", { type: "number", value: montant, onChange: (e) => setMontant(parseFloat(e.target.value)), placeholder: "Montant", className: "border p-2 rounded", required: true }), _jsxs("select", { value: type, onChange: (e) => setType(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "entretien", children: "Entretien" }), _jsx("option", { value: "salaire", children: "Salaire" }), _jsx("option", { value: "charge", children: "Charge" }), _jsx("option", { value: "autre", children: "Autre" })] }), _jsx("input", { type: "date", value: date, onChange: (e) => setDate(e.target.value), className: "border p-2 rounded" }), _jsx("button", { type: "submit", className: "bg-green-600 text-white rounded p-2 col-span-2", children: "Ajouter d\u00E9pense" })] }), _jsx("h3", { className: "text-lg font-semibold mb-2", children: "Liste des d\u00E9penses" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full bg-white border", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100 text-left", children: [_jsx("th", { className: "p-2 border", children: "Date" }), _jsx("th", { className: "p-2 border", children: "Libell\u00E9" }), _jsx("th", { className: "p-2 border", children: "Type" }), _jsx("th", { className: "p-2 border", children: "Montant (FCFA)" })] }) }), _jsx("tbody", { children: depenses.map(dep => (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "p-2 border", children: dep.date }), _jsx("td", { className: "p-2 border", children: dep.libelle }), _jsx("td", { className: "p-2 border", children: dep.type }), _jsx("td", { className: "p-2 border text-right", children: dep.montant.toLocaleString() })] }, dep.id))) }), _jsx("tfoot", { children: _jsxs("tr", { className: "bg-gray-100 font-bold", children: [_jsx("td", { colSpan: 3, className: "p-2 border text-right", children: "Total" }), _jsxs("td", { className: "p-2 border text-right text-green-700", children: [total.toLocaleString(), " FCFA"] })] }) })] }) })] }));
};
export default AgenceDepensesPage;
