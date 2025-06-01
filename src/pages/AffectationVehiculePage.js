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
// AffectationVehiculePage.tsx
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../hooks/useAuth';
const AffectationVehiculePage = () => {
    const { user } = useAuth();
    const [trajets, setTrajets] = useState([]);
    const [selectedTrajet, setSelectedTrajet] = useState(null);
    const [vehicule, setVehicule] = useState('');
    const [chauffeur, setChauffeur] = useState('');
    const [capacite, setCapacite] = useState(70);
    useEffect(() => {
        const fetchTrajets = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.uid))
                return;
            const today = new Date().toISOString().split('T')[0];
            const q = query(collection(db, 'trajets_reels'), where('compagnieId', '==', user.uid), where('date', '>=', today));
            const snapshot = yield getDocs(q);
            const data = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            setTrajets(data);
        });
        fetchTrajets();
    }, [user]);
    const handleAffect = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedTrajet)
            return;
        yield updateDoc(doc(db, 'trajets_reels', selectedTrajet.id), {
            vehicule,
            chauffeur,
            capacite,
        });
        alert('Trajet mis à jour avec succès');
        setSelectedTrajet(null);
        setVehicule('');
        setChauffeur('');
        setCapacite(70);
    });
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-2xl font-bold mb-4", children: "Affectation de v\u00E9hicule" }), _jsx("div", { className: "space-y-4", children: trajets.map((t) => (_jsxs("div", { className: "border p-4 rounded shadow", children: [_jsxs("p", { className: "font-semibold", children: [t.date, " - ", t.heure, " : ", t.departure, " \u2192 ", t.arrival] }), t.vehicule ? (_jsxs("p", { className: "text-sm text-green-600", children: ["Affect\u00E9 \u00E0 ", t.vehicule, " - Chauffeur : ", t.chauffeur] })) : (_jsx("button", { onClick: () => setSelectedTrajet(t), className: "mt-2 text-sm px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600", children: "Affecter" }))] }, t.id))) }), selectedTrajet && (_jsxs("div", { className: "fixed bottom-0 left-0 right-0 bg-white border-t p-4 shadow-xl", children: [_jsxs("h3", { className: "font-semibold mb-2", children: ["Affectation pour le trajet : ", selectedTrajet.departure, " \u2192 ", selectedTrajet.arrival] }), _jsxs("div", { className: "flex gap-4 mb-2", children: [_jsx("input", { className: "border p-2 flex-1", placeholder: "Nom du v\u00E9hicule / Matricule", value: vehicule, onChange: (e) => setVehicule(e.target.value) }), _jsx("input", { className: "border p-2 flex-1", placeholder: "Nom du chauffeur", value: chauffeur, onChange: (e) => setChauffeur(e.target.value) }), _jsx("input", { className: "border p-2 w-24", type: "number", placeholder: "Capacit\u00E9", value: capacite, onChange: (e) => setCapacite(Number(e.target.value)) })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: handleAffect, className: "bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600", children: "Enregistrer" }), _jsx("button", { onClick: () => setSelectedTrajet(null), className: "bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500", children: "Annuler" })] })] }))] }));
};
export default AffectationVehiculePage;
