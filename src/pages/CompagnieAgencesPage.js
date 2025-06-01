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
import { collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, setDoc, } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const CompagnieAgencesPage = () => {
    const { user } = useAuth();
    const [agences, setAgences] = useState([]);
    const [nomAgence, setNomAgence] = useState('');
    const [ville, setVille] = useState('');
    const [pays, setPays] = useState('');
    const [quartier, setQuartier] = useState('');
    const [type, setType] = useState('');
    const [emailGerant, setEmailGerant] = useState('');
    const [nomGerant, setNomGerant] = useState('');
    const [telephone, setTelephone] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [expanded, setExpanded] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editForm, setEditForm] = useState({ nomAgence: '', ville: '', quartier: '' });
    const fetchAgences = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
        const snap = yield getDocs(q);
        const list = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setAgences(list);
    });
    useEffect(() => {
        fetchAgences();
    }, [user]);
    const handleAdd = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        try {
            const userCredential = yield createUserWithEmailAndPassword(auth, emailGerant, motDePasse);
            const uid = userCredential.user.uid;
            const agenceRef = yield addDoc(collection(db, 'agences'), {
                nomAgence,
                ville,
                pays,
                quartier,
                type,
                statut: 'active',
                emailGerant,
                nomGerant,
                telephone,
                companyId: (user === null || user === void 0 ? void 0 : user.companyId) || '',
                latitude: latitude !== '' ? parseFloat(latitude) : null,
                longitude: longitude !== '' ? parseFloat(longitude) : null,
            });
            yield setDoc(doc(db, 'users', uid), {
                uid,
                email: emailGerant,
                nom: nomGerant,
                telephone,
                role: 'chefAgence',
                companyId: (user === null || user === void 0 ? void 0 : user.companyId) || '',
                agencyId: agenceRef.id,
            });
            alert('Agence et gérant créés.');
            setNomAgence('');
            setVille('');
            setPays('');
            setQuartier('');
            setType('');
            setEmailGerant('');
            setNomGerant('');
            setTelephone('');
            setMotDePasse('');
            setLatitude('');
            setLongitude('');
            fetchAgences();
        }
        catch (err) {
            console.error("Erreur pendant la création Firestore:", err.message);
            alert(err.message);
        }
    });
    const handleToggle = (id) => {
        setExpanded(expanded === id ? null : id);
    };
    const handleDelete = (id) => __awaiter(void 0, void 0, void 0, function* () {
        if (window.confirm('Supprimer cette agence ?')) {
            yield deleteDoc(doc(db, 'agences', id));
            fetchAgences();
        }
    });
    const handleToggleStatut = (agence) => __awaiter(void 0, void 0, void 0, function* () {
        const newStatut = agence.statut === 'active' ? 'inactive' : 'active';
        yield updateDoc(doc(db, 'agences', agence.id), { statut: newStatut });
        fetchAgences();
    });
    const handleEditClick = (ag) => {
        setEditingId(ag.id);
        setEditForm({
            nomAgence: ag.nomAgence,
            ville: ag.ville,
            quartier: ag.quartier || '',
        });
    };
    const handleUpdate = (e, id) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        yield updateDoc(doc(db, 'agences', id), {
            nomAgence: editForm.nomAgence,
            ville: editForm.ville,
            quartier: editForm.quartier,
        });
        setEditingId(null);
        fetchAgences();
    });
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Gestion des agences" }), _jsxs("form", { onSubmit: handleAdd, className: "grid md:grid-cols-2 gap-4 mb-8", children: [_jsx("input", { placeholder: "Nom de l\u2019agence", value: nomAgence, onChange: e => setNomAgence(e.target.value), className: "border p-2 rounded", required: true }), _jsx("input", { placeholder: "Ville", value: ville, onChange: e => setVille(e.target.value), className: "border p-2 rounded", required: true }), _jsx("input", { placeholder: "Pays", value: pays, onChange: e => setPays(e.target.value), className: "border p-2 rounded", required: true }), _jsx("input", { placeholder: "Quartier (optionnel)", value: quartier, onChange: e => setQuartier(e.target.value), className: "border p-2 rounded" }), _jsx("input", { placeholder: "Type (optionnel)", value: type, onChange: e => setType(e.target.value), className: "border p-2 rounded" }), _jsx("input", { placeholder: "Latitude (optionnel)", value: latitude, onChange: e => setLatitude(e.target.value), className: "border p-2 rounded" }), _jsx("input", { placeholder: "Longitude (optionnel)", value: longitude, onChange: e => setLongitude(e.target.value), className: "border p-2 rounded" }), _jsx("input", { placeholder: "Nom du g\u00E9rant", value: nomGerant, onChange: e => setNomGerant(e.target.value), className: "border p-2 rounded", required: true }), _jsx("input", { placeholder: "Email du g\u00E9rant", type: "email", value: emailGerant, onChange: e => setEmailGerant(e.target.value), className: "border p-2 rounded", required: true }), _jsx("input", { placeholder: "Mot de passe", type: "password", value: motDePasse, onChange: e => setMotDePasse(e.target.value), className: "border p-2 rounded", required: true }), _jsx("input", { placeholder: "T\u00E9l\u00E9phone", value: telephone, onChange: e => setTelephone(e.target.value), className: "border p-2 rounded", required: true }), _jsx("button", { type: "submit", className: "bg-green-600 text-white rounded p-2 col-span-2", children: "Ajouter l\u2019agence" })] }), _jsx("h3", { className: "text-lg font-semibold mb-2", children: "Liste des agences" }), _jsx("div", { className: "space-y-2", children: agences.map(ag => {
                    var _a, _b;
                    return (_jsxs("div", { className: "bg-white border rounded shadow", children: [_jsxs("div", { onClick: () => handleToggle(ag.id), className: "cursor-pointer p-3 flex justify-between items-center hover:bg-gray-50", children: [_jsx("span", { className: "font-bold text-yellow-800", children: ag.nomAgence }), _jsx("span", { className: `text-sm ${ag.statut === 'active' ? 'text-green-600' : 'text-red-600'}`, children: ag.statut })] }), expanded === ag.id && (_jsxs("div", { className: "p-4 border-t text-sm text-gray-600 space-y-1", children: [_jsxs("p", { children: [_jsx("strong", { children: "Ville:" }), " ", ag.ville, " \u2013 ", _jsx("strong", { children: "Pays:" }), " ", ag.pays] }), _jsxs("p", { children: [_jsx("strong", { children: "Quartier:" }), " ", ag.quartier || '-'] }), _jsxs("p", { children: [_jsx("strong", { children: "Type:" }), " ", ag.type || '-'] }), _jsxs("p", { children: [_jsx("strong", { children: "Latitude:" }), " ", (_a = ag.latitude) !== null && _a !== void 0 ? _a : '-'] }), _jsxs("p", { children: [_jsx("strong", { children: "Longitude:" }), " ", (_b = ag.longitude) !== null && _b !== void 0 ? _b : '-'] }), _jsxs("p", { children: [_jsx("strong", { children: "Email du g\u00E9rant:" }), " ", ag.emailGerant] }), _jsxs("p", { children: [_jsx("strong", { children: "T\u00E9l\u00E9phone:" }), " ", ag.telephone] }), editingId === ag.id ? (_jsxs("form", { onSubmit: (e) => handleUpdate(e, ag.id), className: "grid grid-cols-1 md:grid-cols-2 gap-2 pt-2", children: [_jsx("input", { value: editForm.nomAgence, onChange: (e) => setEditForm(Object.assign(Object.assign({}, editForm), { nomAgence: e.target.value })), className: "border p-1 rounded", placeholder: "Nom agence", required: true }), _jsx("input", { value: editForm.ville, onChange: (e) => setEditForm(Object.assign(Object.assign({}, editForm), { ville: e.target.value })), className: "border p-1 rounded", placeholder: "Ville", required: true }), _jsx("input", { value: editForm.quartier, onChange: (e) => setEditForm(Object.assign(Object.assign({}, editForm), { quartier: e.target.value })), className: "border p-1 rounded", placeholder: "Quartier" }), _jsx("button", { type: "submit", className: "bg-green-600 text-white px-2 py-1 rounded col-span-2", children: "Enregistrer" })] })) : (_jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx("button", { onClick: () => handleToggleStatut(ag), className: "px-2 py-1 rounded bg-yellow-500 text-white", children: ag.statut === 'active' ? 'Désactiver' : 'Activer' }), _jsx("button", { onClick: () => handleEditClick(ag), className: "px-2 py-1 rounded bg-blue-600 text-white", children: "Modifier" }), _jsx("button", { onClick: () => handleDelete(ag.id), className: "px-2 py-1 rounded bg-red-600 text-white", children: "Supprimer" })] }))] }))] }, ag.id));
                }) })] }));
};
export default CompagnieAgencesPage;
