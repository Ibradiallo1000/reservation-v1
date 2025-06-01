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
// src/pages/AdminParametresPage.tsx
import { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const AdminParametresPage = () => {
    const [email, setEmail] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [logo, setLogo] = useState(null);
    const [message, setMessage] = useState('');
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        try {
            const adminRef = doc(db, 'admin', 'parametres');
            yield updateDoc(adminRef, {
                email,
                motDePasse,
            });
            setMessage('Paramètres mis à jour avec succès.');
        }
        catch (error) {
            setMessage('Erreur lors de la mise à jour des paramètres.');
        }
    });
    const handleLogoChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setLogo(e.target.files[0]);
        }
    };
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Param\u00E8tres Admin" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsx("input", { type: "email", placeholder: "Nouvel email", className: "block w-full border px-4 py-2 rounded", value: email, onChange: e => setEmail(e.target.value) }), _jsx("input", { type: "password", placeholder: "Nouveau mot de passe", className: "block w-full border px-4 py-2 rounded", value: motDePasse, onChange: e => setMotDePasse(e.target.value) }), _jsx("input", { type: "file", accept: "image/*", className: "block", onChange: handleLogoChange }), _jsx("button", { type: "submit", className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700", children: "Sauvegarder" })] }), message && _jsx("p", { className: "mt-4 text-green-600", children: message })] }));
};
export default AdminParametresPage;
