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
// ✅ FICHIER 1 — ParametresLegaux.tsx (à placer dans src/pages)
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Save } from 'lucide-react';
const ParametresLegaux = () => {
    const { user } = useAuth();
    const [mentions, setMentions] = useState('');
    const [politique, setPolitique] = useState('');
    const [message, setMessage] = useState('');
    useEffect(() => {
        const fetch = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.companyId))
                return;
            const docRef = doc(db, 'companies', user.companyId);
            const snap = yield getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                setMentions(data.mentionsLegales || '');
                setPolitique(data.politiqueConfidentialite || '');
            }
        });
        fetch();
    }, [user]);
    const handleSave = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        try {
            yield updateDoc(doc(db, 'companies', user.companyId), {
                mentionsLegales: mentions,
                politiqueConfidentialite: politique
            });
            setMessage('Modifications enregistrées.');
        }
        catch (err) {
            console.error(err);
            setMessage("Erreur lors de l'enregistrement.");
        }
    });
    return (_jsxs("div", { className: "max-w-4xl mx-auto p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Mentions l\u00E9gales & politique" }), _jsx("label", { className: "block font-semibold mb-1", children: "Mentions l\u00E9gales" }), _jsx("textarea", { rows: 6, value: mentions, onChange: (e) => setMentions(e.target.value), className: "w-full border rounded p-2 mb-4" }), _jsx("label", { className: "block font-semibold mb-1", children: "Politique de confidentialit\u00E9" }), _jsx("textarea", { rows: 6, value: politique, onChange: (e) => setPolitique(e.target.value), className: "w-full border rounded p-2 mb-4" }), _jsxs("button", { onClick: handleSave, className: "bg-yellow-600 text-white px-4 py-2 rounded flex items-center gap-2", children: [_jsx(Save, { size: 16 }), " Enregistrer"] }), message && _jsx("p", { className: "mt-4 text-green-600", children: message })] }));
};
export default ParametresLegaux;
