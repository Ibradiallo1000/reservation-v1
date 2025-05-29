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
// src/pages/AdminAgentsPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const AdminAgentsPage = () => {
    const [agents, setAgents] = useState([]);
    const [formData, setFormData] = useState({
        nom: '',
        email: '',
        telephone: '',
        ville: '',
    });
    const [message, setMessage] = useState('');
    const fetchAgents = () => __awaiter(void 0, void 0, void 0, function* () {
        const snapshot = yield getDocs(collection(db, 'agents'));
        const data = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setAgents(data);
    });
    useEffect(() => {
        fetchAgents();
    }, []);
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        try {
            yield addDoc(collection(db, 'agents'), formData);
            setMessage('✅ Agent ajouté avec succès.');
            setFormData({ nom: '', email: '', telephone: '', ville: '' });
            fetchAgents();
        }
        catch (error) {
            console.error(error);
            setMessage("❌ Erreur lors de l'ajout.");
        }
    });
    const handleDelete = (id) => __awaiter(void 0, void 0, void 0, function* () {
        const confirm = window.confirm('❗ Supprimer cet agent ?');
        if (!confirm)
            return;
        yield deleteDoc(doc(db, 'agents', id));
        fetchAgents();
    });
    return (_jsxs("div", { className: "p-6 max-w-3xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Gestion des agents" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-3 mb-6", children: [_jsx("input", { type: "text", placeholder: "Nom complet", value: formData.nom, onChange: e => setFormData(Object.assign(Object.assign({}, formData), { nom: e.target.value })), className: "block w-full border px-3 py-2 rounded", required: true }), _jsx("input", { type: "email", placeholder: "Email", value: formData.email, onChange: e => setFormData(Object.assign(Object.assign({}, formData), { email: e.target.value })), className: "block w-full border px-3 py-2 rounded" }), _jsx("input", { type: "text", placeholder: "T\u00E9l\u00E9phone", value: formData.telephone, onChange: e => setFormData(Object.assign(Object.assign({}, formData), { telephone: e.target.value })), className: "block w-full border px-3 py-2 rounded" }), _jsx("input", { type: "text", placeholder: "Ville", value: formData.ville, onChange: e => setFormData(Object.assign(Object.assign({}, formData), { ville: e.target.value })), className: "block w-full border px-3 py-2 rounded" }), _jsx("button", { type: "submit", className: "bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700", children: "Ajouter Agent" })] }), message && _jsx("p", { className: "text-blue-600 mb-4", children: message }), _jsx("h2", { className: "text-lg font-semibold mb-2", children: "Agents enregistr\u00E9s" }), _jsx("ul", { className: "space-y-2", children: agents.map(agent => (_jsxs("li", { className: "border p-3 rounded flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("p", { className: "font-semibold", children: agent.nom }), _jsxs("p", { className: "text-sm text-gray-600", children: [agent.email, " \u2014 ", agent.telephone, " \u2014 ", agent.ville] })] }), _jsx("button", { onClick: () => handleDelete(agent.id), className: "bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600", children: "Supprimer" })] }, agent.id))) })] }));
};
export default AdminAgentsPage;
