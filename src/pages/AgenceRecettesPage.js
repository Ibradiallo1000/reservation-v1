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
// ✅ src/pages/AgenceRecettesPage.tsx
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const AgenceRecettesPage = () => {
    const { user } = useAuth();
    const [libelle, setLibelle] = useState('');
    const [montant, setMontant] = useState(0);
    const [type, setType] = useState('dépôt');
    const [commentaire, setCommentaire] = useState('');
    const [recettes, setRecettes] = useState([]);
    const [total, setTotal] = useState(0);
    const fetchRecettes = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        const q = query(collection(db, 'recettes'), where('agencyId', '==', user.agencyId));
        const snap = yield getDocs(q);
        const list = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setRecettes(list);
        const somme = list.reduce((acc, r) => acc + (r.montant || 0), 0);
        setTotal(somme);
    });
    const handleAdd = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        yield addDoc(collection(db, 'recettes'), {
            libelle,
            montant,
            type,
            commentaire,
            agencyId: user.agencyId,
            createdAt: Timestamp.now(),
            date: new Date().toISOString().split('T')[0],
        });
        setLibelle('');
        setMontant(0);
        setType('dépôt');
        setCommentaire('');
        fetchRecettes();
    });
    useEffect(() => {
        fetchRecettes();
    }, [user]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Enregistrer une recette" }), _jsxs("form", { onSubmit: handleAdd, className: "grid md:grid-cols-2 gap-4 mb-6", children: [_jsx("input", { value: libelle, onChange: e => setLibelle(e.target.value), placeholder: "Libell\u00E9", required: true, className: "border p-2 rounded" }), _jsx("input", { type: "number", value: montant, onChange: e => setMontant(parseFloat(e.target.value)), placeholder: "Montant", required: true, className: "border p-2 rounded" }), _jsxs("select", { value: type, onChange: e => setType(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "d\u00E9p\u00F4t", children: "D\u00E9p\u00F4t" }), _jsx("option", { value: "avance", children: "Avance" }), _jsx("option", { value: "r\u00E8glement", children: "R\u00E8glement" })] }), _jsx("input", { value: commentaire, onChange: e => setCommentaire(e.target.value), placeholder: "Commentaire (optionnel)", className: "border p-2 rounded" }), _jsx("button", { type: "submit", className: "col-span-2 bg-green-600 text-white rounded p-2", children: "Ajouter" })] }), _jsxs("h3", { className: "text-lg font-semibold mb-2", children: ["Liste des recettes (", recettes.length, ")"] }), _jsxs("p", { className: "mb-2 text-green-700 font-bold", children: ["Total encaiss\u00E9 : ", total.toLocaleString(), " FCFA"] }), _jsx("div", { className: "overflow-auto", children: _jsxs("table", { className: "min-w-full text-sm bg-white border", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-200", children: [_jsx("th", { className: "border px-4 py-2", children: "Date" }), _jsx("th", { className: "border px-4 py-2", children: "Libell\u00E9" }), _jsx("th", { className: "border px-4 py-2", children: "Type" }), _jsx("th", { className: "border px-4 py-2", children: "Montant" }), _jsx("th", { className: "border px-4 py-2", children: "Commentaire" })] }) }), _jsx("tbody", { children: recettes.map((r) => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "border px-4 py-2", children: r.date }), _jsx("td", { className: "border px-4 py-2", children: r.libelle }), _jsx("td", { className: "border px-4 py-2 capitalize", children: r.type }), _jsxs("td", { className: "border px-4 py-2 text-right", children: [r.montant.toLocaleString(), " FCFA"] }), _jsx("td", { className: "border px-4 py-2", children: r.commentaire || '-' })] }, r.id))) })] }) })] }));
};
export default AgenceRecettesPage;
