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
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import AdminAjouterCompagnie from './AdminAjouterCompagnie';
const AdminCompagniesPage = () => {
    const [compagnies, setCompagnies] = useState([]);
    const [selectedCompagnieId, setSelectedCompagnieId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({});
    const [message, setMessage] = useState('');
    const fetchCompagnies = () => __awaiter(void 0, void 0, void 0, function* () {
        const snapshot = yield getDocs(collection(db, 'companies'));
        const data = snapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
        setCompagnies(data);
    });
    useEffect(() => {
        fetchCompagnies();
    }, []);
    const handleDelete = (id) => __awaiter(void 0, void 0, void 0, function* () {
        const confirmation = window.confirm('Voulez-vous vraiment supprimer cette compagnie ? Cette action est irréversible.');
        if (!confirmation)
            return;
        try {
            yield deleteDoc(doc(db, 'companies', id));
            setMessage('Compagnie supprimée.');
            setSelectedCompagnieId(null);
            fetchCompagnies();
        }
        catch (error) {
            console.error('Erreur suppression :', error);
            setMessage('Erreur lors de la suppression.');
        }
    });
    const handleToggleStatus = (id, currentStatus) => __awaiter(void 0, void 0, void 0, function* () {
        const newStatus = currentStatus === 'actif' ? 'inactif' : 'actif';
        try {
            yield updateDoc(doc(db, 'compagnies', id), { status: newStatus });
            setMessage(`Statut mis à jour en "${newStatus}".`);
            setSelectedCompagnieId(null);
            fetchCompagnies();
        }
        catch (error) {
            console.error('Erreur statut :', error);
            setMessage('Erreur mise à jour du statut.');
        }
    });
    const handleEdit = (compagnie) => {
        setEditingId(compagnie.id);
        setFormData(Object.assign({}, compagnie));
    };
    const handleUpdate = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            yield updateDoc(doc(db, 'compagnies', editingId), formData);
            setMessage('Compagnie mise à jour.');
            setEditingId(null);
            setSelectedCompagnieId(null);
            fetchCompagnies();
        }
        catch (error) {
            console.error('Erreur mise à jour :', error);
            setMessage('Erreur lors de la mise à jour.');
        }
    });
    const toggleDetails = (id) => {
        setSelectedCompagnieId(selectedCompagnieId === id ? null : id);
    };
    return (_jsxs("div", { className: "flex gap-8 p-6", children: [_jsx("div", { className: "w-1/2", children: _jsx(AdminAjouterCompagnie, { onSuccess: fetchCompagnies }) }), _jsxs("div", { className: "w-1/2", children: [_jsx("h2", { className: "text-lg font-bold mb-4", children: "Compagnies enregistr\u00E9es" }), compagnies.map((c) => (_jsxs("div", { className: "border p-4 mb-3 rounded shadow", children: [_jsxs("p", { className: "font-semibold cursor-pointer", onClick: () => toggleDetails(c.id), children: [c.nom, " ", selectedCompagnieId === c.id && _jsx("span", { className: "text-sm text-gray-500", children: "(cliquez pour replier)" })] }), selectedCompagnieId === c.id && (editingId === c.id ? (_jsxs("div", { children: [_jsx("input", { className: "border px-2 py-1 w-full mb-1", value: formData.nom || '', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { nom: e.target.value })), placeholder: "Nom" }), _jsx("input", { className: "border px-2 py-1 w-full mb-1", value: formData.email || '', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { email: e.target.value })), placeholder: "Email" }), _jsx("input", { className: "border px-2 py-1 w-full mb-1", value: formData.telephone || '', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { telephone: e.target.value })), placeholder: "T\u00E9l\u00E9phone" }), _jsx("input", { className: "border px-2 py-1 w-full mb-1", value: formData.pays || '', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { pays: e.target.value })), placeholder: "Pays" }), _jsxs("select", { className: "border px-2 py-1 w-full mb-1", value: formData.plan || 'free', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { plan: e.target.value })), children: [_jsx("option", { value: "free", children: "Gratuit" }), _jsx("option", { value: "pro", children: "Pro" }), _jsx("option", { value: "premium", children: "Premium" })] }), _jsx("input", { className: "border px-2 py-1 w-full mb-1", value: formData.slug || '', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { slug: e.target.value })), placeholder: "Slug (ex: bamabus)" }), _jsx("input", { type: "number", step: "0.01", min: 0, max: 1, className: "border px-2 py-1 w-full mb-2", value: formData.commissionRate || '', onChange: (e) => setFormData(Object.assign(Object.assign({}, formData), { commissionRate: parseFloat(e.target.value) })), placeholder: "Commission (ex: 0.05)" }), _jsx("button", { onClick: handleUpdate, className: "mr-2 text-sm px-3 py-1 rounded bg-green-500 text-white hover:bg-green-600", children: "Enregistrer" }), _jsx("button", { onClick: () => setEditingId(null), className: "text-sm px-3 py-1 rounded bg-gray-400 text-white hover:bg-gray-500", children: "Annuler" })] })) : (_jsxs("div", { children: [_jsxs("p", { className: "text-sm text-gray-600", children: ["Email : ", c.email || 'Non défini'] }), _jsxs("p", { className: "text-sm text-gray-600", children: ["T\u00E9l\u00E9phone : ", c.telephone || 'Non défini'] }), _jsxs("p", { className: "text-sm text-gray-600", children: ["Pays : ", c.pays || 'Non défini'] }), _jsxs("p", { className: `text-sm ${c.status === 'inactif' ? 'text-red-600' : 'text-green-600'}`, children: ["Statut : ", c.status || 'actif'] }), _jsxs("p", { className: "text-sm text-gray-600", children: ["Plan : ", c.plan || 'free'] }), _jsxs("p", { className: "text-sm text-gray-600", children: ["Slug : ", c.slug || '—'] }), _jsxs("p", { className: "text-sm text-gray-600", children: ["Commission : ", (c.commissionRate || 0.05) * 100, "%"] }), _jsxs("div", { className: "flex gap-2 mt-3", children: [_jsx("button", { onClick: () => handleEdit(c), className: "text-sm px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600", children: "Modifier" }), _jsx("button", { onClick: () => handleToggleStatus(c.id, c.status || 'actif'), className: "text-sm px-3 py-1 rounded bg-yellow-400 text-white hover:bg-yellow-500", children: c.status === 'inactif' ? 'Réactiver' : 'Désactiver' }), _jsx("button", { onClick: () => handleDelete(c.id), className: "text-sm px-3 py-1 rounded bg-red-500 text-white hover:bg-red-600", children: "Supprimer" })] })] })))] }, c.id))), message && _jsx("p", { className: "mt-4 text-blue-600", children: message })] })] }));
};
export default AdminCompagniesPage;
