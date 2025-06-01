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
// src/pages/AjouterPersonnelPlateforme.tsx
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
const AjouterPersonnelPlateforme = () => {
    const [email, setEmail] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [nom, setNom] = useState('');
    const [role, setRole] = useState('support');
    const [message, setMessage] = useState('');
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        setMessage('');
        if (!email || !motDePasse || !nom || !role) {
            setMessage("Tous les champs sont obligatoires.");
            return;
        }
        try {
            const userCredential = yield createUserWithEmailAndPassword(auth, email, motDePasse);
            const uid = userCredential.user.uid;
            yield addDoc(collection(db, 'users'), {
                uid,
                email,
                nom,
                role,
                createdAt: new Date()
            });
            setMessage("✅ Utilisateur ajouté avec succès.");
            setEmail('');
            setMotDePasse('');
            setNom('');
            setRole('support');
        }
        catch (error) {
            console.error("Erreur :", error);
            setMessage("❌ Une erreur s'est produite : " + error.message);
        }
    });
    return (_jsxs("div", { className: "p-6 max-w-xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Ajouter un membre de l\u2019\u00E9quipe plateforme" }), _jsxs("form", { onSubmit: handleSubmit, className: "bg-white p-4 rounded shadow space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block mb-1 font-semibold", children: "Nom complet" }), _jsx("input", { type: "text", value: nom, onChange: (e) => setNom(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1 font-semibold", children: "Email" }), _jsx("input", { type: "email", value: email, onChange: (e) => setEmail(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1 font-semibold", children: "Mot de passe" }), _jsx("input", { type: "password", value: motDePasse, onChange: (e) => setMotDePasse(e.target.value), className: "w-full border p-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block mb-1 font-semibold", children: "R\u00F4le" }), _jsxs("select", { value: role, onChange: (e) => setRole(e.target.value), className: "w-full border p-2 rounded", children: [_jsx("option", { value: "support", children: "Support" }), _jsx("option", { value: "commercial", children: "Commercial" }), _jsx("option", { value: "admin_plateforme", children: "Administrateur Plateforme" })] })] }), _jsx("button", { type: "submit", className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700", children: "Ajouter l\u2019utilisateur" }), message && _jsx("div", { className: "mt-2 text-center text-sm text-gray-700", children: message })] })] }));
};
export default AjouterPersonnelPlateforme;
