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
// ✅ src/pages/FormulaireEnvoiCourrier.tsx – version professionnelle avec sections et calcul dynamique
import { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const FormulaireEnvoiCourrier = () => {
    const { user } = useAuth();
    const [expediteur, setExpediteur] = useState('');
    const [telephone, setTelephone] = useState('');
    const [destinataire, setDestinataire] = useState('');
    const [numeroDestinataire, setNumeroDestinataire] = useState('');
    const [ville, setVille] = useState('');
    const [adresse, setAdresse] = useState('');
    const [description, setDescription] = useState('');
    const [typeColis, setTypeColis] = useState('colis');
    const [modePaiement, setModePaiement] = useState('espèces');
    const [valeur, setValeur] = useState(0);
    const [montant, setMontant] = useState(null);
    const [trajetId, setTrajetId] = useState('');
    const [trajets, setTrajets] = useState([]);
    useEffect(() => {
        const pourcentage = 0.05; // ⚠️ Peut être dynamique selon compagnie
        if (valeur > 0) {
            setMontant(Math.ceil(valeur * pourcentage));
        }
        else {
            setMontant(null);
        }
    }, [valeur]);
    useEffect(() => {
        const fetchTrajets = () => __awaiter(void 0, void 0, void 0, function* () {
            const q = query(collection(db, 'dailyTrips'), where('companyId', '==', user === null || user === void 0 ? void 0 : user.companyId));
            const snap = yield getDocs(q);
            const today = new Date().toISOString().split('T')[0]; // 📅 Date du jour
            const list = snap.docs
                .map(doc => (Object.assign({ id: doc.id }, doc.data())))
                .filter(trajet => trajet.date >= today); // ✅ Ne garder que les dates à venir
            setTrajets(list);
        });
        fetchTrajets();
    }, [user === null || user === void 0 ? void 0 : user.companyId]);
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        yield addDoc(collection(db, 'courriers'), {
            expediteur,
            telephone,
            destinataire,
            numeroDestinataire,
            ville,
            adresse,
            description,
            typeColis,
            modePaiement,
            valeur,
            montant: montant || 0,
            statut: 'en attente',
            createdAt: new Date().toISOString(),
            agencyId: user.agencyId,
            companyId: user.companyId,
            trajetId,
            type: 'envoi',
        });
        alert('📦 Courrier enregistré avec succès !');
        setExpediteur('');
        setTelephone('');
        setDestinataire('');
        setNumeroDestinataire('');
        setVille('');
        setAdresse('');
        setDescription('');
        setTypeColis('colis');
        setModePaiement('espèces');
        setValeur(0);
        setMontant(null);
        setTrajetId('');
    });
    return (_jsxs("div", { className: "p-6 max-w-4xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCE6 Enregistrement d\u2019un envoi" }), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-6 bg-white p-6 rounded-lg shadow-md", children: [_jsxs("fieldset", { className: "border rounded p-4", children: [_jsx("legend", { className: "text-lg font-semibold text-gray-700", children: "\uD83E\uDDCD Informations de l\u2019exp\u00E9diteur" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mt-4", children: [_jsx("input", { value: expediteur, onChange: e => setExpediteur(e.target.value), placeholder: "Nom de l'exp\u00E9diteur", className: "border p-2 rounded", required: true }), _jsx("input", { value: telephone, onChange: e => setTelephone(e.target.value), placeholder: "T\u00E9l\u00E9phone de l'exp\u00E9diteur", className: "border p-2 rounded", required: true })] })] }), _jsxs("fieldset", { className: "border rounded p-4", children: [_jsx("legend", { className: "text-lg font-semibold text-gray-700", children: "\uD83D\uDCEC Destinataire" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mt-4", children: [_jsx("input", { value: destinataire, onChange: e => setDestinataire(e.target.value), placeholder: "Nom du destinataire", className: "border p-2 rounded", required: true }), _jsx("input", { value: numeroDestinataire, onChange: e => setNumeroDestinataire(e.target.value), placeholder: "Num\u00E9ro du destinataire", className: "border p-2 rounded", required: true }), _jsx("input", { value: ville, onChange: e => setVille(e.target.value), placeholder: "Ville de destination", className: "border p-2 rounded", required: true }), _jsx("input", { value: adresse, onChange: e => setAdresse(e.target.value), placeholder: "Adresse de livraison", className: "border p-2 rounded" })] })] }), _jsxs("fieldset", { className: "border rounded p-4", children: [_jsx("legend", { className: "text-lg font-semibold text-gray-700", children: "\uD83D\uDCE6 Colis" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mt-4", children: [_jsx("input", { value: description, onChange: e => setDescription(e.target.value), placeholder: "Description du colis", className: "border p-2 rounded" }), _jsxs("select", { value: typeColis, onChange: e => setTypeColis(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "colis", children: "Colis" }), _jsx("option", { value: "document", children: "Document" }), _jsx("option", { value: "autre", children: "Autre" })] })] })] }), _jsxs("fieldset", { className: "border rounded p-4", children: [_jsx("legend", { className: "text-lg font-semibold text-gray-700", children: "\uD83D\uDCB0 Paiement" }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4 mt-4", children: [_jsx("input", { type: "number", value: valeur, onChange: e => setValeur(Number(e.target.value)), placeholder: "Valeur d\u00E9clar\u00E9e (FCFA)", className: "border p-2 rounded", required: true }), _jsxs("select", { value: modePaiement, onChange: e => setModePaiement(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "esp\u00E8ces", children: "Esp\u00E8ces" }), _jsx("option", { value: "mobile_money", children: "Mobile Money" }), _jsx("option", { value: "virement", children: "Virement bancaire" })] })] }), montant !== null && _jsxs("div", { className: "text-right mt-2 text-green-600 font-semibold", children: ["Montant \u00E0 payer : ", montant, " FCFA"] })] }), _jsxs("fieldset", { className: "border rounded p-4", children: [_jsx("legend", { className: "text-lg font-semibold text-gray-700", children: "\uD83D\uDE8C Trajet assign\u00E9" }), _jsxs("select", { value: trajetId, onChange: e => setTrajetId(e.target.value), className: "border p-2 rounded w-full mt-4", required: true, children: [_jsx("option", { value: "", children: "-- S\u00E9lectionner un trajet --" }), trajets.map(trajet => (_jsxs("option", { value: trajet.id, children: [trajet.departure, " \u2192 ", trajet.arrival, " (", trajet.date, " \u00E0 ", trajet.time, ")"] }, trajet.id)))] })] }), _jsx("div", { className: "text-right", children: _jsx("button", { type: "submit", className: "bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded font-medium", children: "Enregistrer l\u2019envoi" }) })] })] }));
};
export default FormulaireEnvoiCourrier;
