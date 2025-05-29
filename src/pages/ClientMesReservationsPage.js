var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from "react";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import ModifierReservationForm from "./ModifierReservationForm"; // ✅ importer le formulaire
const ClientMesReservationsPage = () => {
    const [phone, setPhone] = useState("");
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [reservationAModifier, setReservationAModifier] = useState(null); // ✅ état pour suivre la modif
    const navigate = useNavigate();
    const chercherReservations = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!phone)
            return;
        setLoading(true);
        setError("");
        try {
            const q = query(collection(db, "reservations"), where("telephone", "==", phone));
            const snapshot = yield getDocs(q);
            const data = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            setReservations(data);
        }
        catch (err) {
            setError("Erreur lors de la recherche.");
        }
        setLoading(false);
    });
    const estModifiable = (dateDepart) => {
        var _a;
        const maintenant = dayjs();
        const depart = dayjs((_a = dateDepart === null || dateDepart === void 0 ? void 0 : dateDepart.toDate) === null || _a === void 0 ? void 0 : _a.call(dateDepart));
        return depart.diff(maintenant, "hour") > 24;
    };
    const annulerReservation = (id) => __awaiter(void 0, void 0, void 0, function* () {
        const confirm = window.confirm("Voulez-vous vraiment annuler cette réservation ?");
        if (!confirm)
            return;
        try {
            yield updateDoc(doc(db, "reservations", id), {
                statut: "annulée"
            });
            alert("Réservation annulée.");
            setReservations(prev => prev.map(r => (r.id === id ? Object.assign(Object.assign({}, r), { statut: "annulée" }) : r)));
        }
        catch (err) {
            alert("Erreur lors de l'annulation.");
        }
    });
    return (_jsxs("div", { className: "p-4 max-w-3xl mx-auto", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Consulter mes r\u00E9servations" }), _jsx("p", { className: "mb-2 text-sm text-gray-600", children: "Entrez votre num\u00E9ro de t\u00E9l\u00E9phone pour afficher vos r\u00E9servations." }), _jsxs("div", { className: "flex space-x-2 mb-6", children: [_jsx("input", { type: "tel", placeholder: "Num\u00E9ro de t\u00E9l\u00E9phone", value: phone, onChange: (e) => setPhone(e.target.value), className: "border border-gray-300 rounded px-4 py-2 w-full" }), _jsx("button", { onClick: chercherReservations, className: "bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700", children: "Rechercher" })] }), loading && _jsx("p", { children: "Chargement..." }), error && _jsx("p", { className: "text-red-500", children: error }), reservations.length > 0 && (_jsx("div", { className: "overflow-auto rounded-lg shadow", children: _jsxs("table", { className: "min-w-full bg-white text-sm", children: [_jsx("thead", { className: "bg-gray-100 text-left", children: _jsxs("tr", { children: [_jsx("th", { className: "p-3", children: "Date de d\u00E9part" }), _jsx("th", { className: "p-3", children: "Trajet" }), _jsx("th", { className: "p-3", children: "Statut" }), _jsx("th", { className: "p-3", children: "Action" })] }) }), _jsx("tbody", { children: reservations.map((r) => {
                                var _a, _b, _c;
                                return (_jsxs("tr", { className: "border-t", children: [_jsx("td", { className: "p-3", children: dayjs(typeof ((_a = r.date_depart) === null || _a === void 0 ? void 0 : _a.toDate) === 'function'
                                                ? r.date_depart.toDate()
                                                : r.date_depart).format("DD/MM/YYYY HH:mm") }), _jsxs("td", { className: "p-3", children: [(_b = r.trip) === null || _b === void 0 ? void 0 : _b.departure, " \u2192 ", (_c = r.trip) === null || _c === void 0 ? void 0 : _c.arrival] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-1 rounded-full text-white text-xs ${r.statut === "payée"
                                                    ? "bg-green-500"
                                                    : r.statut === "en attente"
                                                        ? "bg-yellow-500"
                                                        : "bg-red-500"}`, children: r.statut }) }), _jsxs("td", { className: "p-3 space-x-2", children: [_jsx("button", { onClick: () => navigate(`/recu/${r.id}`), className: "text-blue-600 hover:underline text-sm", children: "Voir billet" }), estModifiable(r.date_depart) && r.statut === "payée" && (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => annulerReservation(r.id), className: "text-red-600 hover:underline text-sm", children: "Annuler" }), _jsx("button", { onClick: () => setReservationAModifier(r), className: "text-indigo-600 hover:underline text-sm", children: "\u270F\uFE0F Modifier" })] }))] })] }, r.id));
                            }) })] }) })), reservations.length === 0 && !loading && phone && (_jsx("p", { className: "text-gray-500 text-sm mt-4", children: "Aucune r\u00E9servation trouv\u00E9e pour ce num\u00E9ro." })), reservationAModifier && (_jsx(ModifierReservationForm, { reservation: reservationAModifier, onClose: () => setReservationAModifier(null), onUpdated: chercherReservations }))] }));
};
export default ClientMesReservationsPage;
