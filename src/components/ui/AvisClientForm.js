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
// ✅ Fichier : AvisClientForm.tsx — Permet aux visiteurs de laisser un avis
import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { Star } from 'lucide-react';
const AvisClientForm = ({ companyId, onSuccess }) => {
    const [nom, setNom] = useState('');
    const [note, setNote] = useState(0);
    const [commentaire, setCommentaire] = useState('');
    const [message, setMessage] = useState(null);
    const [loading, setLoading] = useState(false);
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!nom.trim() || note < 1 || !commentaire.trim()) {
            setMessage("Veuillez remplir tous les champs et choisir une note.");
            return;
        }
        try {
            setLoading(true);
            yield addDoc(collection(db, 'avis'), {
                nom,
                note,
                commentaire,
                visible: false, // Par défaut invisible
                companyId,
                createdAt: serverTimestamp(),
            });
            setMessage("Merci pour votre avis ! Il sera publié après validation.");
            setNom('');
            setNote(0);
            setCommentaire('');
            if (onSuccess)
                onSuccess();
        }
        catch (err) {
            console.error(err);
            setMessage("Erreur lors de l'envoi. Veuillez réessayer.");
        }
        finally {
            setLoading(false);
        }
    });
    return (_jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [message && _jsx("p", { className: "text-sm text-gray-600 italic", children: message }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Votre nom" }), _jsx("input", { type: "text", value: nom, onChange: (e) => setNom(e.target.value), className: "w-full border px-3 py-2 rounded", required: true })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700 mb-1", children: "Votre note" }), _jsx("div", { className: "flex gap-1", children: [1, 2, 3, 4, 5].map((n) => (_jsx(Star, { onClick: () => setNote(n), className: `h-6 w-6 cursor-pointer ${n <= note ? 'text-yellow-400' : 'text-gray-300'}`, fill: n <= note ? '#facc15' : 'none' }, n))) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Votre avis" }), _jsx("textarea", { value: commentaire, onChange: (e) => setCommentaire(e.target.value), className: "w-full border px-3 py-2 rounded", rows: 4, required: true })] }), _jsx("button", { type: "submit", disabled: loading, className: "bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700", children: loading ? 'Envoi en cours...' : 'Envoyer mon avis' })] }));
};
export default AvisClientForm;
