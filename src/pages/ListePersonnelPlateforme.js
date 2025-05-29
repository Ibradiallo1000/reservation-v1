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
// src/pages/ListePersonnelPlateforme.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const ListePersonnelPlateforme = () => {
    const [utilisateurs, setUtilisateurs] = useState([]);
    const [loading, setLoading] = useState(true);
    const fetchUtilisateurs = () => __awaiter(void 0, void 0, void 0, function* () {
        const usersSnap = yield getDocs(collection(db, 'users'));
        const data = usersSnap.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                email: d.email || '',
                role: d.role || 'inconnu',
                displayName: d.displayName || '',
            };
        });
        setUtilisateurs(data);
        setLoading(false);
    });
    useEffect(() => {
        fetchUtilisateurs();
    }, []);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Personnel de la plateforme" }), _jsx("p", { className: "mb-6 text-gray-600", children: "Liste des utilisateurs avec leur r\u00F4le et adresse e-mail." }), loading ? (_jsx("p", { children: "Chargement en cours..." })) : (_jsxs("table", { className: "w-full table-auto border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "border px-4 py-2", children: "Nom" }), _jsx("th", { className: "border px-4 py-2", children: "Email" }), _jsx("th", { className: "border px-4 py-2", children: "R\u00F4le" })] }) }), _jsx("tbody", { children: utilisateurs.map(user => (_jsxs("tr", { className: "hover:bg-gray-50", children: [_jsx("td", { className: "border px-4 py-2", children: user.displayName || '—' }), _jsx("td", { className: "border px-4 py-2", children: user.email }), _jsx("td", { className: "border px-4 py-2 font-medium text-indigo-700", children: user.role })] }, user.id))) })] }))] }));
};
export default ListePersonnelPlateforme;
