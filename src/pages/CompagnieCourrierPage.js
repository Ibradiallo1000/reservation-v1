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
// src/pages/CompagnieCourrierPage.tsx
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const CompagnieCourrierPage = () => {
    const { user } = useAuth();
    const [courriers, setCourriers] = useState([]);
    const [description, setDescription] = useState('');
    const [receiver, setReceiver] = useState('');
    const [departure, setDeparture] = useState('');
    const [arrival, setArrival] = useState('');
    const [loading, setLoading] = useState(false);
    const loadCourriers = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'courriers'), where('companyId', '==', user.companyId));
        const snapshot = yield getDocs(q);
        const list = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setCourriers(list);
    });
    const handleAddCourrier = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!description || !receiver || !departure || !arrival || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        setLoading(true);
        try {
            yield addDoc(collection(db, 'courriers'), {
                companyId: user.companyId,
                description,
                receiver,
                departure,
                arrival,
                status: 'En attente',
                createdAt: Timestamp.now()
            });
            setDescription('');
            setReceiver('');
            setDeparture('');
            setArrival('');
            yield loadCourriers();
        }
        catch (err) {
            console.error('Erreur ajout courrier :', err);
        }
        setLoading(false);
    });
    useEffect(() => {
        loadCourriers();
    }, [user]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Gestion des courriers" }), _jsxs("div", { className: "bg-white rounded-xl shadow p-4 mb-6", children: [_jsx("h2", { className: "font-semibold text-lg mb-3", children: "Ajouter un courrier" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4", children: [_jsx("input", { type: "text", placeholder: "Description", value: description, onChange: (e) => setDescription(e.target.value), className: "border p-2 rounded w-full" }), _jsx("input", { type: "text", placeholder: "Destinataire", value: receiver, onChange: (e) => setReceiver(e.target.value), className: "border p-2 rounded w-full" }), _jsx("input", { type: "text", placeholder: "Ville de d\u00E9part", value: departure, onChange: (e) => setDeparture(e.target.value), className: "border p-2 rounded w-full" }), _jsx("input", { type: "text", placeholder: "Ville d\u2019arriv\u00E9e", value: arrival, onChange: (e) => setArrival(e.target.value), className: "border p-2 rounded w-full" })] }), _jsx("button", { onClick: handleAddCourrier, disabled: loading, className: "mt-4 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700", children: loading ? 'Ajout...' : 'Ajouter' })] }), _jsxs("div", { className: "bg-white rounded-xl shadow p-4", children: [_jsx("h2", { className: "font-semibold text-lg mb-3", children: "Liste des courriers" }), courriers.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "Aucun courrier enregistr\u00E9." })) : (_jsx("ul", { className: "divide-y", children: courriers.map((courrier) => (_jsx("li", { className: "py-2", children: _jsxs("div", { className: "flex justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: courrier.description }), _jsxs("p", { className: "text-sm text-gray-600", children: [courrier.departure, " \u2192 ", courrier.arrival, " | Destinataire : ", courrier.receiver] })] }), _jsx("span", { className: "text-sm text-gray-500 italic", children: courrier.status })] }) }, courrier.id))) }))] })] }));
};
export default CompagnieCourrierPage;
