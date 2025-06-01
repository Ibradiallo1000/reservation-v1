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
// src/pages/AdminDepensesPage.tsx
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { CSVLink } from 'react-csv';
import { format } from 'date-fns';
const AdminDepensesPage = () => {
    const [depenses, setDepenses] = useState([]);
    const [filtered, setFiltered] = useState([]);
    const [formData, setFormData] = useState({ motif: '', montant: '', categorie: '', date: '' });
    const [categorieFilter, setCategorieFilter] = useState('all');
    const fetchDepenses = () => __awaiter(void 0, void 0, void 0, function* () {
        const snapshot = yield getDocs(collection(db, 'depenses'));
        const data = snapshot.docs.map((doc) => {
            const d = doc.data();
            return {
                id: doc.id,
                motif: d.motif,
                montant: d.montant,
                categorie: d.categorie,
                date: d.date ? format(d.date.toDate(), 'yyyy-MM-dd') : '—'
            };
        });
        setDepenses(data);
    });
    useEffect(() => {
        fetchDepenses();
    }, []);
    useEffect(() => {
        let result = depenses;
        if (categorieFilter !== 'all') {
            result = result.filter(d => d.categorie === categorieFilter);
        }
        setFiltered(result);
    }, [depenses, categorieFilter]);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => (Object.assign(Object.assign({}, prev), { [name]: value })));
    };
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        const { motif, montant, categorie, date } = formData;
        if (!motif || !montant || !categorie || !date)
            return alert('Tous les champs sont obligatoires.');
        yield addDoc(collection(db, 'depenses'), {
            motif,
            montant: parseFloat(montant),
            categorie,
            date: Timestamp.fromDate(new Date(date))
        });
        setFormData({ motif: '', montant: '', categorie: '', date: '' });
        fetchDepenses();
    });
    const totalMontant = filtered.reduce((sum, d) => sum + d.montant, 0);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "D\u00E9penses journali\u00E8res" }), _jsxs("form", { onSubmit: handleSubmit, className: "bg-white p-4 rounded shadow mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx("input", { name: "motif", value: formData.motif, onChange: handleChange, placeholder: "Motif", className: "border rounded px-3 py-2", required: true }), _jsx("input", { name: "montant", type: "number", value: formData.montant, onChange: handleChange, placeholder: "Montant", className: "border rounded px-3 py-2", required: true }), _jsxs("select", { name: "categorie", value: formData.categorie, onChange: handleChange, className: "border rounded px-3 py-2", required: true, children: [_jsx("option", { value: "", children: "Cat\u00E9gorie" }), _jsx("option", { value: "carburant", children: "Carburant" }), _jsx("option", { value: "maintenance", children: "Maintenance" }), _jsx("option", { value: "salaire", children: "Salaire" }), _jsx("option", { value: "autre", children: "Autre" })] }), _jsx("input", { name: "date", type: "date", value: formData.date, onChange: handleChange, className: "border rounded px-3 py-2", required: true }), _jsx("button", { type: "submit", className: "col-span-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700", children: "Ajouter la d\u00E9pense" })] }), _jsxs("div", { className: "mb-4 flex flex-wrap gap-4 items-center", children: [_jsxs("select", { value: categorieFilter, onChange: e => setCategorieFilter(e.target.value), className: "border rounded px-2 py-1", children: [_jsx("option", { value: "all", children: "Toutes les cat\u00E9gories" }), _jsx("option", { value: "carburant", children: "Carburant" }), _jsx("option", { value: "maintenance", children: "Maintenance" }), _jsx("option", { value: "salaire", children: "Salaire" }), _jsx("option", { value: "autre", children: "Autre" })] }), filtered.length > 0 && (_jsx(CSVLink, { data: filtered.map(row => ({
                            Motif: row.motif,
                            Montant: row.montant,
                            Catégorie: row.categorie,
                            Date: row.date
                        })), filename: `depenses_${new Date().toISOString().slice(0, 10)}.csv`, className: "bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700", children: "Exporter CSV" }))] }), _jsxs("div", { className: "overflow-x-auto", children: [_jsxs("table", { className: "min-w-full table-auto border", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border px-4 py-2", children: "Motif" }), _jsx("th", { className: "border px-4 py-2", children: "Montant" }), _jsx("th", { className: "border px-4 py-2", children: "Cat\u00E9gorie" }), _jsx("th", { className: "border px-4 py-2", children: "Date" })] }) }), _jsxs("tbody", { children: [filtered.map((d, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border px-4 py-2", children: d.motif }), _jsxs("td", { className: "border px-4 py-2", children: [d.montant.toLocaleString(), " FCFA"] }), _jsx("td", { className: "border px-4 py-2 capitalize", children: d.categorie }), _jsx("td", { className: "border px-4 py-2", children: d.date })] }, i))), filtered.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "text-center p-4 text-gray-500", children: "Aucune d\u00E9pense trouv\u00E9e." }) }))] })] }), _jsxs("div", { className: "mt-4 text-right font-semibold text-lg", children: ["Total des sorties : ", totalMontant.toLocaleString(), " FCFA"] })] })] }));
};
export default AdminDepensesPage;
