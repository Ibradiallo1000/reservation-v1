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
import { useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
const countries = [
    { name: 'Mali', code: '+223' },
    { name: 'Sénégal', code: '+221' },
    { name: "Côte d'Ivoire", code: '+225' },
    { name: 'Burkina Faso', code: '+226' },
    { name: 'Togo', code: '+228' },
];
const slugify = (str) => str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
const AdminAjouterCompagnie = ({ onSuccess }) => {
    const [nom, setNom] = useState('');
    const [responsable, setResponsable] = useState('');
    const [email, setEmail] = useState('');
    const [motDePasse, setMotDePasse] = useState('');
    const [pays, setPays] = useState(countries[0].name);
    const [code, setCode] = useState(countries[0].code);
    const [telephone, setTelephone] = useState('');
    const [latitude, setLatitude] = useState(null);
    const [longitude, setLongitude] = useState(null);
    const [loading, setLoading] = useState(false);
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        setLoading(true);
        try {
            const userCredential = yield createUserWithEmailAndPassword(auth, email, motDePasse);
            const uid = userCredential.user.uid;
            const companyId = uid;
            const slug = slugify(nom);
            const defaultFooterConfig = {
                showSocialMedia: true,
                showTestimonials: true,
                showLegalLinks: true,
                showContactForm: true,
                customLinks: [
                    { title: 'FAQ', url: '/faq' },
                    { title: 'Aide', url: '/aide' }
                ]
            };
            const defaultSocialMedia = {
                facebook: '',
                instagram: '',
                twitter: '',
                linkedin: '',
                youtube: '',
                tiktok: ''
            };
            yield setDoc(doc(db, 'companies', companyId), {
                nom,
                email,
                pays,
                telephone: `${code}${telephone}`,
                responsable,
                plan: 'free',
                createdAt: Timestamp.now(),
                commission: 10,
                logoUrl: '',
                banniereUrl: '',
                description: '',
                slug,
                latitude: latitude || null,
                longitude: longitude || null,
                footerConfig: defaultFooterConfig,
                socialMedia: defaultSocialMedia,
                themeStyle: 'moderne',
                couleurPrimaire: '#3B82F6',
                couleurSecondaire: '#10B981',
                police: 'sans-serif'
            });
            yield setDoc(doc(db, 'users', uid), {
                email,
                role: 'admin_compagnie',
                companyId,
                companyName: nom,
                nom: responsable,
                createdAt: Timestamp.now()
            });
            alert('✅ Compagnie et utilisateur créés avec succès.');
            setNom('');
            setEmail('');
            setMotDePasse('');
            setTelephone('');
            setResponsable('');
            setLatitude(null);
            setLongitude(null);
            if (onSuccess)
                onSuccess();
        }
        catch (error) {
            alert('❌ Erreur : ' + error.message);
        }
        finally {
            setLoading(false);
        }
    });
    return (_jsxs("div", { className: "p-6 max-w-2xl mx-auto", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: "Ajouter une compagnie" }), _jsxs("form", { onSubmit: handleSubmit, className: "grid grid-cols-1 gap-4", children: [_jsx("input", { required: true, value: nom, onChange: (e) => setNom(e.target.value), placeholder: "Nom de la compagnie", className: "border p-2 rounded" }), _jsx("input", { required: true, value: responsable, onChange: (e) => setResponsable(e.target.value), placeholder: "Nom du responsable", className: "border p-2 rounded" }), _jsx("input", { required: true, type: "email", value: email, onChange: (e) => setEmail(e.target.value), placeholder: "Email du responsable", className: "border p-2 rounded" }), _jsx("input", { required: true, type: "password", value: motDePasse, onChange: (e) => setMotDePasse(e.target.value), placeholder: "Mot de passe", className: "border p-2 rounded" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("select", { value: pays, onChange: (e) => {
                                    const selected = countries.find(c => c.name === e.target.value);
                                    if (selected) {
                                        setPays(selected.name);
                                        setCode(selected.code);
                                    }
                                }, className: "border p-2 rounded w-1/2", children: countries.map(c => (_jsx("option", { value: c.name, children: c.name }, c.code))) }), _jsx("input", { required: true, value: telephone, onChange: (e) => setTelephone(e.target.value), placeholder: "Num\u00E9ro de t\u00E9l\u00E9phone", className: "border p-2 rounded w-1/2" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("input", { type: "number", step: "any", value: latitude !== null && latitude !== void 0 ? latitude : '', onChange: (e) => setLatitude(e.target.value ? parseFloat(e.target.value) : null), placeholder: "Latitude (optionnel)", className: "border p-2 rounded w-1/2" }), _jsx("input", { type: "number", step: "any", value: longitude !== null && longitude !== void 0 ? longitude : '', onChange: (e) => setLongitude(e.target.value ? parseFloat(e.target.value) : null), placeholder: "Longitude (optionnel)", className: "border p-2 rounded w-1/2" })] }), _jsx("button", { type: "submit", disabled: loading, className: "bg-blue-600 text-white p-2 rounded", children: loading ? 'Enregistrement...' : 'Ajouter la compagnie' })] })] }));
};
export default AdminAjouterCompagnie;
