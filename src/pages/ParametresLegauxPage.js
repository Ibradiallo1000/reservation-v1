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
// ✅ ParametresLegauxPage.tsx — configuration des mentions légales et politiques
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, CheckCircle, AlertCircle } from 'lucide-react';
const ParametresLegauxPage = () => {
    const { user } = useAuth();
    const [politiqueConfidentialite, setPolitiqueConfidentialite] = useState('');
    const [conditionsUtilisation, setConditionsUtilisation] = useState('');
    const [message, setMessage] = useState({ text: '', type: 'info' });
    useEffect(() => {
        if (user === null || user === void 0 ? void 0 : user.companyId) {
            const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
                const ref = doc(db, 'companies', user.companyId);
                const snap = yield getDoc(ref);
                if (snap.exists()) {
                    const data = snap.data();
                    setPolitiqueConfidentialite(data.politiqueConfidentialite || '');
                    setConditionsUtilisation(data.conditionsUtilisation || '');
                }
            });
            fetchData();
        }
    }, [user]);
    const handleSave = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setMessage({ text: 'Enregistrement en cours...', type: 'info' });
        try {
            const ref = doc(db, 'companies', user.companyId);
            yield updateDoc(ref, {
                politiqueConfidentialite,
                conditionsUtilisation
            });
            setMessage({ text: 'Mentions mises à jour avec succès.', type: 'success' });
        }
        catch (e) {
            console.error(e);
            setMessage({ text: "Erreur lors de l'enregistrement.", type: 'error' });
        }
    });
    return (_jsxs("div", { className: "max-w-4xl mx-auto p-6 bg-white rounded shadow", children: [_jsx("h2", { className: "text-xl font-bold mb-6", children: "Mentions l\u00E9gales & politique de confidentialit\u00E9" }), _jsx(AnimatePresence, { children: message.text && (_jsx(motion.div, { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, className: `p-4 rounded mb-4 ${message.type === 'success'
                        ? 'bg-green-100 text-green-800'
                        : message.type === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'}`, children: _jsxs("div", { className: "flex justify-between items-center", children: [_jsxs("div", { className: "flex items-center gap-2", children: [message.type === 'success' ? _jsx(CheckCircle, {}) : message.type === 'error' ? _jsx(AlertCircle, {}) : _jsx(Save, {}), _jsx("span", { children: message.text })] }), message.type === 'success' && (_jsx("button", { onClick: () => setMessage({ text: '', type: 'info' }), className: "text-sm underline", children: "OK" }))] }) })) }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold mb-2", children: "Politique de confidentialit\u00E9" }), _jsx("textarea", { rows: 6, value: politiqueConfidentialite, onChange: (e) => setPolitiqueConfidentialite(e.target.value), className: "w-full border border-gray-300 rounded p-3", placeholder: "Expliquer comment les donn\u00E9es clients sont collect\u00E9es et utilis\u00E9es." })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold mb-2", children: "Conditions d'utilisation" }), _jsx("textarea", { rows: 6, value: conditionsUtilisation, onChange: (e) => setConditionsUtilisation(e.target.value), className: "w-full border border-gray-300 rounded p-3", placeholder: "Lister les r\u00E8gles d'utilisation de la plateforme par les clients." })] }), _jsx("div", { className: "flex justify-end", children: _jsxs("button", { onClick: handleSave, className: "bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded flex items-center gap-2", children: [_jsx(Save, { size: 18 }), " Enregistrer"] }) })] })] }));
};
export default ParametresLegauxPage;
