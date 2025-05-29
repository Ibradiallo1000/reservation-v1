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
// ✅ src/pages/ReceptionCourrierPage.tsx – Corrigé avec vérification simple de la ville
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const ReceptionCourrierPage = () => {
    const { user } = useAuth();
    const [courriers, setCourriers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // ✅ Version simple et sûre
    const getUserVille = () => {
        if (!user)
            return null;
        return user.ville || null;
    };
    const fetchCourriers = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            setLoading(true);
            setError(null);
            const userVille = getUserVille();
            if (!userVille) {
                setError("Configuration requise : Votre ville n'est pas définie dans votre profil");
                setLoading(false);
                return;
            }
            const q = query(collection(db, 'courriers'), where('statut', '==', 'en attente'), where('type', '==', 'envoi'), where('ville', '==', userVille));
            const snap = yield getDocs(q);
            const list = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            setCourriers(list);
        }
        catch (err) {
            setError("Erreur de chargement : " + err.message);
            console.error("Erreur Firestore:", err);
        }
        finally {
            setLoading(false);
        }
    });
    const marquerCommeRecu = (id) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const confirmer = window.confirm('Confirmer la réception de ce courrier ?');
            if (!confirmer)
                return;
            yield updateDoc(doc(db, 'courriers', id), {
                statut: 'reçu',
                receivedAt: new Date().toISOString(),
                receivedBy: (user === null || user === void 0 ? void 0 : user.uid) || '',
                agencyReceptId: (user === null || user === void 0 ? void 0 : user.agencyId) || ''
            });
            // Mise à jour locale
            setCourriers(prev => prev.filter(c => c.id !== id));
        }
        catch (err) {
            setError("Erreur lors de la mise à jour : " + err.message);
        }
    });
    useEffect(() => {
        fetchCourriers();
    }, [user]);
    const userVille = getUserVille();
    return (_jsxs("div", { className: "p-6 max-w-5xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCE5 R\u00E9ception de courriers" }), error && _jsx("p", { className: "text-red-600", children: error }), loading ? (_jsx("p", { children: "Chargement..." })) : !userVille ? (_jsx("p", { className: "text-yellow-600", children: "Ville non d\u00E9finie dans le profil utilisateur" })) : courriers.length === 0 ? (_jsxs("p", { children: ["Aucun courrier \u00E0 r\u00E9ceptionner pour ", userVille, "."] })) : (_jsx("ul", { className: "space-y-4", children: courriers.map(courrier => (_jsxs("li", { className: "border p-4 rounded bg-white shadow", children: [_jsxs("p", { children: [_jsx("strong", { children: "Exp\u00E9diteur :" }), " ", courrier.expediteur] }), _jsxs("p", { children: [_jsx("strong", { children: "Destinataire :" }), " ", courrier.destinataire] }), _jsxs("p", { children: [_jsx("strong", { children: "Valeur :" }), " ", courrier.valeur.toLocaleString(), " FCFA"] }), _jsxs("p", { children: [_jsx("strong", { children: "Frais :" }), " ", courrier.montant.toLocaleString(), " FCFA"] }), _jsx("button", { onClick: () => marquerCommeRecu(courrier.id), className: "mt-2 bg-green-600 text-white px-4 py-2 rounded", children: "\u2705 Marquer comme re\u00E7u" })] }, courrier.id))) }))] }));
};
export default ReceptionCourrierPage;
