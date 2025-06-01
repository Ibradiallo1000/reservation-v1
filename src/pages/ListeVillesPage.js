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
// src/pages/ListeVillesPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const ListeVillesPage = () => {
    const [villes, setVilles] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchVilles = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const snap = yield getDocs(collection(db, 'villes'));
                const data = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
                const sorted = data.sort((a, b) => a.nom.localeCompare(b.nom));
                setVilles(sorted);
            }
            catch (err) {
                console.error('Erreur chargement des villes :', err);
            }
            finally {
                setLoading(false);
            }
        });
        fetchVilles();
    }, []);
    const filteredVilles = villes.filter(v => v.nom.toLowerCase().includes(search.toLowerCase()));
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "\uD83D\uDCCD Liste des villes enregistr\u00E9es" }), _jsx("input", { type: "text", placeholder: "Rechercher une ville...", value: search, onChange: e => setSearch(e.target.value), className: "mb-4 p-2 border w-full md:w-1/2 rounded" }), loading ? (_jsx("p", { className: "text-gray-500", children: "Chargement..." })) : (_jsxs("table", { className: "w-full table-auto border", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-200 text-left", children: [_jsx("th", { className: "p-2 border", children: "#" }), _jsx("th", { className: "p-2 border", children: "Nom de la ville" })] }) }), _jsx("tbody", { children: filteredVilles.map((ville, index) => (_jsxs("tr", { className: "border-t hover:bg-gray-50", children: [_jsx("td", { className: "p-2 border", children: index + 1 }), _jsx("td", { className: "p-2 border font-medium", children: ville.nom })] }, ville.id))) })] })), !loading && filteredVilles.length === 0 && (_jsx("p", { className: "text-center text-gray-500 mt-4", children: "Aucune ville trouv\u00E9e." }))] }));
};
export default ListeVillesPage;
