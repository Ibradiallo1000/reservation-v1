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
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
const AgencePersonnelPage = () => {
    const { user } = useAuth();
    const [agents, setAgents] = useState([]);
    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [role, setRole] = useState('guichetier');
    const [password, setPassword] = useState('');
    const loadAgents = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        const q = query(collection(db, 'users'), where('agencyId', '==', user.agencyId));
        const snap = yield getDocs(q);
        const list = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setAgents(list);
    });
    useEffect(() => {
        loadAgents();
    }, [user]);
    const handleAdd = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!email || !password || !displayName || !(user === null || user === void 0 ? void 0 : user.agencyId) || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const cred = yield createUserWithEmailAndPassword(auth, email, password);
        yield addDoc(collection(db, 'users'), {
            uid: cred.user.uid,
            email,
            displayName,
            role,
            agencyId: user.agencyId,
            companyId: user.companyId,
            createdAt: new Date().toISOString(),
        });
        setEmail('');
        setDisplayName('');
        setPassword('');
        loadAgents();
    });
    const handleDelete = (id) => __awaiter(void 0, void 0, void 0, function* () {
        if (!window.confirm('Supprimer cet agent ?'))
            return;
        yield deleteDoc(doc(db, 'users', id));
        loadAgents();
    });
    return (_jsxs("div", { className: "p-6 max-w-4xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "Gestion du personnel" }), _jsxs("div", { className: "mb-6 grid grid-cols-1 md:grid-cols-2 gap-4", children: [_jsx("input", { value: displayName, onChange: e => setDisplayName(e.target.value), placeholder: "Nom", className: "border p-2 rounded" }), _jsx("input", { value: email, onChange: e => setEmail(e.target.value), placeholder: "Email", type: "email", className: "border p-2 rounded" }), _jsx("input", { value: password, onChange: e => setPassword(e.target.value), placeholder: "Mot de passe", type: "password", className: "border p-2 rounded" }), _jsxs("select", { value: role, onChange: e => setRole(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "guichetier", children: "Guichetier" }), _jsx("option", { value: "agentCourrier", children: "Agent de courrier" })] })] }), _jsx("button", { onClick: handleAdd, className: "bg-blue-600 text-white px-4 py-2 rounded mb-6", children: "Ajouter l\u2019agent" }), _jsx("h2", { className: "text-xl font-semibold mb-4", children: "Agents de cette agence" }), agents.length === 0 ? (_jsx("p", { className: "text-gray-500", children: "Aucun agent enregistr\u00E9." })) : (_jsx("ul", { className: "space-y-2", children: agents.map(agent => (_jsxs("li", { className: "border p-3 rounded flex justify-between items-center bg-white shadow", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: agent.displayName }), _jsxs("p", { className: "text-sm text-gray-500", children: [agent.email, " \u2022 ", agent.role] })] }), _jsx("button", { onClick: () => handleDelete(agent.id), className: "text-red-600 text-sm hover:underline", children: "Supprimer" })] }, agent.id))) }))] }));
};
export default AgencePersonnelPage;
