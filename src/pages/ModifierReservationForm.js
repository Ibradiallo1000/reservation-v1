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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const ModifierReservationForm = ({ reservation, onClose, onUpdated }) => {
    const [form, setForm] = useState({
        nomClient: reservation.nomClient || '',
        telephone: reservation.telephone || '',
        depart: reservation.depart || '',
        arrivee: reservation.arrivee || '',
        date: reservation.date || '',
        heure: reservation.heure || '',
        seatsGo: reservation.seatsGo || 1,
        seatsReturn: reservation.seatsReturn || 0,
        typeVoyage: reservation.seatsReturn > 0 ? 'aller-retour' : 'aller-simple',
    });
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(Object.assign(Object.assign({}, form), { [name]: name.includes('seats') ? parseInt(value) : value }));
    };
    const handleSubmit = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        const ref = doc(db, 'reservations', reservation.id);
        yield updateDoc(ref, {
            nomClient: form.nomClient,
            telephone: form.telephone,
            depart: form.depart,
            arrivee: form.arrivee,
            date: form.date,
            heure: form.heure,
            seatsGo: form.seatsGo,
            seatsReturn: form.typeVoyage === 'aller-retour' ? form.seatsReturn : 0,
            updatedAt: new Date().toISOString()
        });
        onUpdated();
        onClose();
    });
    return (_jsx("div", { className: "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50", children: _jsxs("form", { onSubmit: handleSubmit, className: "bg-white p-6 rounded-lg shadow-lg w-full max-w-xl space-y-4", children: [_jsx("h2", { className: "text-xl font-bold", children: "Modifier la r\u00E9servation" }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsx("input", { name: "nomClient", value: form.nomClient, onChange: handleChange, placeholder: "Nom", className: "border p-2 rounded" }), _jsx("input", { name: "telephone", value: form.telephone, onChange: handleChange, placeholder: "T\u00E9l\u00E9phone", className: "border p-2 rounded" }), _jsx("input", { name: "depart", value: form.depart, onChange: handleChange, placeholder: "D\u00E9part", className: "border p-2 rounded" }), _jsx("input", { name: "arrivee", value: form.arrivee, onChange: handleChange, placeholder: "Arriv\u00E9e", className: "border p-2 rounded" }), _jsx("input", { name: "date", type: "date", value: form.date, onChange: handleChange, className: "border p-2 rounded" }), _jsx("input", { name: "heure", type: "time", value: form.heure, onChange: handleChange, className: "border p-2 rounded" })] }), _jsxs("div", { className: "flex gap-4 items-center", children: [_jsxs("label", { children: [_jsx("input", { type: "radio", name: "typeVoyage", value: "aller-simple", checked: form.typeVoyage === 'aller-simple', onChange: handleChange }), " Aller simple"] }), _jsxs("label", { children: [_jsx("input", { type: "radio", name: "typeVoyage", value: "aller-retour", checked: form.typeVoyage === 'aller-retour', onChange: handleChange }), " Aller-retour"] })] }), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsx("input", { name: "seatsGo", type: "number", value: form.seatsGo, onChange: handleChange, placeholder: "Places aller", className: "border p-2 rounded" }), form.typeVoyage === 'aller-retour' && (_jsx("input", { name: "seatsReturn", type: "number", value: form.seatsReturn, onChange: handleChange, placeholder: "Places retour", className: "border p-2 rounded" }))] }), _jsxs("div", { className: "flex justify-end gap-4", children: [_jsx("button", { type: "button", onClick: onClose, className: "text-gray-500", children: "Annuler" }), _jsx("button", { type: "submit", className: "bg-blue-600 text-white px-4 py-2 rounded", children: "Enregistrer" })] })] }) }));
};
export default ModifierReservationForm;
