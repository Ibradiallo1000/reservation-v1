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
// src/pages/ChefAgencePersonnelPage.tsx
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const ChefAgencePersonnelPage = () => {
    const { user } = useAuth(); // user contient agencyId
    const [personnel, setPersonnel] = useState([]);
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [role, setRole] = useState('guichetier');
    const fetchPersonnel = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        const q = query(collection(db, 'users'), where('agencyId', '==', user.agencyId));
        const snapshot = yield getDocs(q);
        const data = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        setPersonnel(data);
    });
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!nom || !email || !motDePasse || !role || !(user === null || user === void 0 ? void 0 : user.agencyId)) {
            alert('Tous les champs sont obligatoires.');
            return;
        }
        try {
            yield addDoc(collection(db, 'users'), {
                nom,
                email,
                motDePasse,
                role,
                agencyId: user.agencyId,
                createdAt: new Date(),
            });
            alert('Utilisateur ajouté avec succès.');
            setNom('');
            setEmail('');
            setMotDePasse('');
            setRole('guichetier');
            fetchPersonnel();
        }
        catch (error) {
            console.error('Erreur lors de l’ajout :', error);
            alert('Erreur lors de l’ajout de l’utilisateur.');
        }
    });
    useEffect(() => {
        fetchPersonnel();
    }, [user]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Personnel de l'agence" }), _jsxs("form", { onSubmit: handleSubmit, className: "bg-gray-100 p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Nom complet" }), _jsx("input", { type: "text", value: nom, onChange: (e) => setNom(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Mot de passe temporaire" }), _jsx("input", { type: "text", value: motDePasse, onChange: (e) => setMotDePasse(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "R\u00F4le" }), _jsxs("select", { value: role, onChange: (e) => setRole(e.target.value), className: "w-full border p-2 rounded", required: true, children: [_jsx("option", { value: "guichetier", children: "Guichetier" }), _jsx("option", { value: "agent_courrier", children: "Agent de courrier" })] })] }), _jsx("button", { type: "submit", className: "mt-4 bg-blue-600 text-white px-4 py-2 rounded md:col-span-2", children: "Ajouter l'utilisateur" })] }), _jsx("h3", { className: "text-lg font-semibold mb-2", children: "Liste actuelle" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full bg-white border border-gray-200 shadow", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "px-4 py-2 border", children: "Nom" }), _jsx("th", { className: "px-4 py-2 border", children: "Email" }), _jsx("th", { className: "px-4 py-2 border", children: "R\u00F4le" })] }) }), _jsxs("tbody", { children: [personnel.map((p) => (_jsxs("tr", { children: [_jsx("td", { className: "px-4 py-2 border", children: p.nom }), _jsx("td", { className: "px-4 py-2 border", children: p.email }), _jsx("td", { className: "px-4 py-2 border", children: p.role })] }, p.id))), personnel.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "text-center p-4 text-gray-500", children: "Aucun personnel enregistr\u00E9 pour cette agence." }) }))] })] }) })] }));
};
export default ChefAgencePersonnelPage;
