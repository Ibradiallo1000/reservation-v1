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
// ✅ ParametresReseauxPage.tsx — paramètres séparés pour réseaux sociaux uniquement
import { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
const ParametresReseauxPage = () => {
    var _a, _b;
    const { user } = useAuth();
    const [companyData, setCompanyData] = useState({
        socialMedia: {
            facebook: '', instagram: '', whatsapp: '', tiktok: '', linkedin: '', youtube: ''
        },
        footerConfig: {
            showSocialMedia: true
        }
    });
    const [message, setMessage] = useState({ text: '', type: '' });
    useEffect(() => {
        if (user === null || user === void 0 ? void 0 : user.companyId) {
            const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
                const ref = doc(db, 'companies', user.companyId);
                const snap = yield getDoc(ref);
                if (snap.exists()) {
                    const data = snap.data();
                    setCompanyData(prev => (Object.assign(Object.assign({}, prev), { socialMedia: data.socialMedia || prev.socialMedia, footerConfig: data.footerConfig || prev.footerConfig })));
                }
            });
            fetchData();
        }
    }, [user]);
    const handleSave = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setMessage({ text: 'Enregistrement...', type: 'info' });
        try {
            const ref = doc(db, 'companies', user.companyId);
            yield updateDoc(ref, {
                socialMedia: companyData.socialMedia,
                footerConfig: companyData.footerConfig
            });
            setMessage({ text: 'Modifications enregistrées', type: 'success' });
        }
        catch (e) {
            console.error(e);
            setMessage({ text: "Erreur lors de l'enregistrement", type: 'error' });
        }
    });
    return (_jsxs("div", { className: "max-w-4xl mx-auto p-6 bg-white rounded shadow", children: [_jsx("h2", { className: "text-xl font-bold mb-6", children: "R\u00E9seaux sociaux & affichage" }), _jsx(AnimatePresence, { children: message.text && (_jsx(motion.div, { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -10 }, className: `p-4 rounded mb-4 ${message.type === 'success'
                        ? 'bg-green-100 text-green-800'
                        : message.type === 'error'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'}`, children: _jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { children: message.text }), message.type === 'success' && (_jsx("button", { onClick: () => setMessage({ text: '', type: '' }), className: "text-sm underline", children: "OK" }))] }) })) }), _jsxs("div", { className: "space-y-6", children: [_jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold mb-2", children: "Liens des r\u00E9seaux sociaux" }), _jsx("div", { className: "space-y-3", children: ['facebook', 'instagram', 'whatsapp', 'tiktok', 'linkedin', 'youtube'].map((platform) => {
                                    var _a;
                                    return (_jsx("input", { type: "url", placeholder: `Lien ${platform}`, value: ((_a = companyData.socialMedia) === null || _a === void 0 ? void 0 : _a[platform]) || '', onChange: (e) => {
                                            const val = e.target.value;
                                            setCompanyData((prev) => (Object.assign(Object.assign({}, prev), { socialMedia: Object.assign(Object.assign({}, prev.socialMedia), { [platform]: val }) })));
                                        }, className: "w-full px-3 py-2 border border-gray-300 rounded-md" }, platform));
                                }) })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold mb-2", children: "Affichage dans le pied de page" }), _jsxs("label", { className: "inline-flex items-center", children: [_jsx("input", { type: "checkbox", checked: (_b = (_a = companyData.footerConfig) === null || _a === void 0 ? void 0 : _a.showSocialMedia) !== null && _b !== void 0 ? _b : true, onChange: (e) => setCompanyData(prev => (Object.assign(Object.assign({}, prev), { footerConfig: Object.assign(Object.assign({}, prev.footerConfig), { showSocialMedia: e.target.checked }) }))), className: "mr-2" }), " Afficher les ic\u00F4nes de r\u00E9seaux sociaux"] })] }), _jsx("div", { className: "flex justify-end", children: _jsxs("button", { onClick: handleSave, className: "bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded flex items-center gap-2", children: [_jsx(Save, { size: 18 }), " Enregistrer"] }) })] })] }));
};
export default ParametresReseauxPage;
