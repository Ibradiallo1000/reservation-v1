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
// src/pages/AjouterAgenceForm.tsx
import { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const AjouterAgenceForm = ({ onAdd }) => {
    const { user } = useAuth();
    const [nomAgence, setNomAgence] = useState('');
    const [pays, setPays] = useState('');
    const [ville, setVille] = useState('');
    const [quartier, setQuartier] = useState('');
    const [type, setType] = useState('');
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!(user === null || user === void 0 ? void 0 : user.companyId)) {
            alert("Erreur : utilisateur non autorisé ou ID compagnie manquant.");
            return;
        }
        if (!nomAgence || !pays || !ville) {
            alert('Veuillez remplir au moins : nom, pays et ville.');
            return;
        }
        const nouvelleAgence = {
            nomAgence,
            pays,
            ville,
            quartier,
            type,
            companyId: user.companyId,
            status: 'active',
            createdAt: new Date(),
            estSiege: false
        };
        try {
            yield addDoc(collection(db, 'agences'), nouvelleAgence);
            alert('✅ Agence ajoutée avec succès.');
            setNomAgence('');
            setPays('');
            setVille('');
            setQuartier('');
            setType('');
            onAdd();
        }
        catch (error) {
            console.error('❌ Erreur lors de l’ajout :', error);
            alert('Une erreur est survenue lors de l’ajout.');
        }
    });
    return (_jsxs("form", { onSubmit: handleSubmit, className: "bg-gray-100 p-4 rounded mb-6", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Nom de l\u2019agence" }), _jsx("input", { type: "text", value: nomAgence, onChange: (e) => setNomAgence(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Pays" }), _jsx("input", { type: "text", value: pays, onChange: (e) => setPays(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Ville" }), _jsx("input", { type: "text", value: ville, onChange: (e) => setVille(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Quartier (optionnel)" }), _jsx("input", { type: "text", value: quartier, onChange: (e) => setQuartier(e.target.value), className: "w-full border p-2 rounded" })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1", children: "Type (optionnel)" }), _jsx("input", { type: "text", value: type, onChange: (e) => setType(e.target.value), className: "w-full border p-2 rounded" })] })] }), _jsx("button", { type: "submit", className: "mt-4 bg-green-600 text-white px-4 py-2 rounded", children: "Ajouter l\u2019agence" })] }));
};
export default AjouterAgenceForm;
