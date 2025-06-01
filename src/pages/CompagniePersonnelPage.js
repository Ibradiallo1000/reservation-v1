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
// src/pages/CompagniePersonnelPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const CompagniePersonnelPage = () => {
    const { user } = useAuth();
    const [agents, setAgents] = useState([]);
    const fetchAgents = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'users'), where('companyId', '==', user.companyId));
        const snapshot = yield getDocs(q);
        const list = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setAgents(list);
    });
    useEffect(() => {
        fetchAgents();
    }, [user]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Gestion du personnel" }), _jsxs("div", { className: "bg-white rounded-xl shadow p-4", children: [_jsx("h2", { className: "font-semibold text-lg mb-3", children: "Liste des agents" }), agents.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "Aucun agent trouv\u00E9." })) : (_jsxs("table", { className: "w-full table-auto border", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "border px-4 py-2", children: "Nom" }), _jsx("th", { className: "border px-4 py-2", children: "R\u00F4le" }), _jsx("th", { className: "border px-4 py-2", children: "Email" }), _jsx("th", { className: "border px-4 py-2", children: "T\u00E9l\u00E9phone" }), _jsx("th", { className: "border px-4 py-2", children: "Agence" })] }) }), _jsx("tbody", { children: agents.map((agent) => {
                                    var _a;
                                    return (_jsxs("tr", { children: [_jsx("td", { className: "border px-4 py-2", children: agent.displayName || '-' }), _jsx("td", { className: "border px-4 py-2", children: agent.role }), _jsx("td", { className: "border px-4 py-2", children: agent.email }), _jsx("td", { className: "border px-4 py-2", children: agent.telephone || '-' }), _jsx("td", { className: "border px-4 py-2", children: ((_a = agent.agence) === null || _a === void 0 ? void 0 : _a.nom) || '-' })] }, agent.id));
                                }) })] }))] })] }));
};
export default CompagniePersonnelPage;
