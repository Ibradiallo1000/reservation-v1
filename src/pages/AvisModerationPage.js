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
// ✅ Fichier : AvisModerationPage.tsx — Permet à une compagnie de modérer les avis
import { useEffect, useState } from 'react';
import { collection, getDocs, query, updateDoc, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const AvisModerationPage = () => {
    const { user } = useAuth();
    const [avisList, setAvisList] = useState([]);
    const [loading, setLoading] = useState(true);
    const fetchAvis = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'avis'), where('companyId', '==', user.companyId));
        const snap = yield getDocs(q);
        const data = snap.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        setAvisList(data);
        setLoading(false);
    });
    useEffect(() => {
        fetchAvis();
    }, [user]);
    const toggleVisibility = (id, visible) => __awaiter(void 0, void 0, void 0, function* () {
        yield updateDoc(doc(db, 'avis', id), { visible: !visible });
        fetchAvis();
    });
    const handleDelete = (id) => __awaiter(void 0, void 0, void 0, function* () {
        yield deleteDoc(doc(db, 'avis', id));
        fetchAvis();
    });
    if (loading)
        return _jsx("p", { children: "Chargement des avis..." });
    return (_jsxs("div", { className: "max-w-4xl mx-auto p-6", children: [_jsx("h2", { className: "text-2xl font-bold mb-4", children: "Mod\u00E9ration des avis clients" }), avisList.length === 0 ? (_jsx("p", { children: "Aucun avis pour l\u2019instant." })) : (_jsx("ul", { className: "space-y-4", children: avisList.map((avis) => (_jsxs("li", { className: "border p-4 rounded shadow-sm", children: [_jsxs("div", { className: "flex justify-between items-center mb-2", children: [_jsxs("h4", { className: "font-semibold", children: [avis.nom, " \u2014 \u2B50 ", avis.note] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => toggleVisibility(avis.id, avis.visible), className: `text-sm px-3 py-1 rounded ${avis.visible ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`, children: avis.visible ? 'Masquer' : 'Afficher' }), _jsx("button", { onClick: () => handleDelete(avis.id), className: "text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded", children: "Supprimer" })] })] }), _jsx("p", { className: "text-sm text-gray-600 italic", children: avis.commentaire })] }, avis.id))) }))] }));
};
export default AvisModerationPage;
