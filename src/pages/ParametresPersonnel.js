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
// src/pages/ParametresPersonnel.tsx
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const ParametresPersonnel = () => {
    const [utilisateurs, setUtilisateurs] = useState([]);
    const [agences, setAgences] = useState([]);
    // Champs du formulaire
    const [nom, setNom] = useState('');
    const [email, setEmail] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [role, setRole] = useState('guichetier');
    const [agencyId, setAgencyId] = useState('');
    const fetchUtilisateurs = () => __awaiter(void 0, void 0, void 0, function* () {
        const q = query(collection(db, 'users'));
        const snapshot = yield getDocs(q);
        const data = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        setUtilisateurs(data);
    });
    const fetchAgences = () => __awaiter(void 0, void 0, void 0, function* () {
        const snapshot = yield getDocs(collection(db, 'agences'));
        const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            nomAgence: doc.data().nomAgence,
        }));
        setAgences(data);
    });
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!nom || !email || !motDePasse || !agencyId || !role) {
            alert('Tous les champs sont obligatoires.');
            return;
        }
        try {
            yield addDoc(collection(db, 'users'), {
                nom,
                email,
                motDePasse,
                role,
                agencyId,
                createdAt: new Date(),
            });
            alert('Utilisateur ajouté avec succès.');
            setNom('');
            setEmail('');
            setMotDePasse('');
            setRole('guichetier');
            setAgencyId('');
            fetchUtilisateurs();
        }
        catch (error) {
            console.error('Erreur ajout utilisateur :', error);
            alert("Erreur lors de l'ajout.");
        }
    });
    useEffect(() => {
        fetchAgences();
        fetchUtilisateurs();
    }, []);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Gestion du personnel" }), _jsxs("form", { onSubmit: handleSubmit, className: "bg-gray-100 p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Nom complet" }), _jsx("input", { type: "text", value: nom, onChange: (e) => setNom(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Mot de passe temporaire" }), _jsx("input", { type: "text", value: motDePasse, onChange: (e) => setMotDePasse(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "R\u00F4le" }), _jsxs("select", { value: role, onChange: (e) => setRole(e.target.value), className: "w-full border p-2 rounded", required: true, children: [_jsx("option", { value: "guichetier", children: "Guichetier" }), _jsx("option", { value: "agent_courrier", children: "Agent de courrier" }), _jsx("option", { value: "chef_agence", children: "Chef d\u2019agence" })] })] }), _jsxs("div", { className: "md:col-span-2", children: [_jsx("label", { className: "block mb-1", children: "Agence" }), _jsxs("select", { value: agencyId, onChange: (e) => setAgencyId(e.target.value), className: "w-full border p-2 rounded", required: true, children: [_jsx("option", { value: "", children: "-- S\u00E9lectionner une agence --" }), agences.map((agence) => (_jsx("option", { value: agence.id, children: agence.nomAgence }, agence.id)))] })] }), _jsx("button", { type: "submit", className: "mt-4 bg-green-600 text-white px-4 py-2 rounded md:col-span-2", children: "Ajouter l'utilisateur" })] }), _jsx("h3", { className: "text-lg font-semibold mb-2", children: "Liste du personnel" }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "min-w-full bg-white border border-gray-200 shadow", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "px-4 py-2 border", children: "Nom" }), _jsx("th", { className: "px-4 py-2 border", children: "Email" }), _jsx("th", { className: "px-4 py-2 border", children: "R\u00F4le" }), _jsx("th", { className: "px-4 py-2 border", children: "Agence" })] }) }), _jsxs("tbody", { children: [utilisateurs.map((user) => (_jsxs("tr", { children: [_jsx("td", { className: "px-4 py-2 border", children: user.nom }), _jsx("td", { className: "px-4 py-2 border", children: user.email }), _jsx("td", { className: "px-4 py-2 border", children: user.role }), _jsx("td", { className: "px-4 py-2 border", children: user.agencyId })] }, user.id))), utilisateurs.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 4, className: "text-center p-4 text-gray-500", children: "Aucun personnel enregistr\u00E9." }) }))] })] }) })] }));
};
export default ParametresPersonnel;
