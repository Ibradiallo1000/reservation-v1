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
import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
import ModifierReservationForm from './ModifierReservationForm';
const style = document.createElement('style');
style.innerHTML = `
@media print {
  body * { visibility: hidden !important; }
  #receipt, #receipt * { visibility: visible !important; }
  #receipt {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 1cm;
    font-size: 12px;
  }
}`;
document.head.appendChild(style);
const AgenceReservationPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const receiptRef = useRef(null);
    const [depart, setDepart] = useState('');
    const [arrivee, setArrivee] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [datesDisponibles, setDatesDisponibles] = useState([]);
    const [horaires, setHoraires] = useState([]);
    const [selectedHoraire, setSelectedHoraire] = useState('');
    const [reservations, setReservations] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [reservationAModifier, setReservationAModifier] = useState(null);
    const normalize = (str) => str.trim().charAt(0).toUpperCase() + str.trim().slice(1).toLowerCase();
    const handleSearch = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!depart || !arrivee || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const snapshot = yield getDocs(collection(db, 'dailyTrips'));
        const results = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        const trajetsFiltres = results.filter((t) => normalize(t.departure) === normalize(depart) &&
            normalize(t.arrival) === normalize(arrivee) &&
            t.companyId === user.companyId);
        const dates = Array.from(new Set(trajetsFiltres.map((t) => t.date)));
        setDatesDisponibles(dates);
        setSelectedDate(dates[0] || '');
        setHoraires([]);
        setSelectedHoraire('');
        setReservations([]);
    });
    const loadHoraires = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedDate || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const snapshot = yield getDocs(collection(db, 'dailyTrips'));
        const trajetsFiltres = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())))
            .filter(t => normalize(t.departure) === normalize(depart) &&
            normalize(t.arrival) === normalize(arrivee) &&
            t.date === selectedDate &&
            t.companyId === user.companyId);
        const heures = trajetsFiltres.map(t => t.time);
        setHoraires(heures);
        setSelectedHoraire(heures[0] || '');
    });
    const fetchReservations = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedHoraire || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const snapshot = yield getDocs(collection(db, 'dailyTrips'));
        const trajetsFiltres = snapshot.docs.map(doc => (Object.assign(Object.assign({}, doc.data()), { id: doc.id })))
            .filter((t) => normalize(t.departure) === normalize(depart) &&
            normalize(t.arrival) === normalize(arrivee) &&
            t.date === selectedDate &&
            t.time === selectedHoraire &&
            t.companyId === user.companyId);
        if (trajetsFiltres.length === 0)
            return;
        const tripId = trajetsFiltres[0].id;
        const resQuery = query(collection(db, 'reservations'), where('trajetId', '==', tripId), where('statut', '==', 'payé'), where('agencyId', '==', user.agencyId));
        const resSnap = yield getDocs(resQuery);
        const list = resSnap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setReservations(list);
    });
    const filteredReservations = reservations.filter(res => res.nomClient.toLowerCase().includes(searchTerm.toLowerCase()) ||
        res.telephone.includes(searchTerm));
    useEffect(() => {
        if (selectedDate)
            loadHoraires();
    }, [selectedDate]);
    useEffect(() => {
        if (selectedHoraire)
            fetchReservations();
    }, [selectedHoraire]);
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Liste de R\u00E9servations" }), _jsxs("div", { className: "flex flex-wrap gap-3 mb-4 items-center", children: [_jsx("input", { value: depart, onChange: e => setDepart(e.target.value), placeholder: "D\u00E9part", className: "border p-2 rounded" }), _jsx("input", { value: arrivee, onChange: e => setArrivee(e.target.value), placeholder: "Arriv\u00E9e", className: "border p-2 rounded" }), _jsx("button", { onClick: handleSearch, className: "bg-yellow-500 text-white px-4 py-2 rounded", children: "Rechercher" }), _jsx("input", { type: "text", placeholder: "Recherche nom ou t\u00E9l\u00E9phone", value: searchTerm, onChange: e => setSearchTerm(e.target.value), className: "border p-2 rounded flex-1" })] }), datesDisponibles.length > 0 && (_jsx("div", { className: "flex gap-2 flex-wrap mb-4", children: datesDisponibles.map(date => (_jsx("button", { onClick: () => setSelectedDate(date), className: `px-3 py-1 rounded-full text-sm border ${selectedDate === date ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800'}`, children: date }, date))) })), horaires.length > 0 && (_jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "block text-sm mb-1", children: "Choisir une heure :" }), _jsx("select", { value: selectedHoraire, onChange: e => setSelectedHoraire(e.target.value), className: "border p-2 rounded", children: horaires.map(h => _jsx("option", { value: h, children: h }, h)) })] })), _jsxs("div", { className: "mb-4 flex justify-between items-center flex-wrap gap-3", children: [_jsx("button", { onClick: () => navigate(-1), className: "text-sm text-blue-500 underline", children: "\u2190 Retour" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => html2pdf().from(receiptRef.current).save(), className: "bg-green-600 text-white px-4 py-2 rounded", children: "\uD83D\uDCC4 PDF" }), _jsx("button", { onClick: () => window.print(), className: "bg-blue-600 text-white px-4 py-2 rounded", children: "\uD83D\uDDA8\uFE0F Imprimer" }), _jsx("button", { onClick: () => {
                                    const data = filteredReservations.map((res, i) => ({
                                        '#': i + 1,
                                        Nom: res.nomClient,
                                        Téléphone: res.telephone,
                                        Lieux: `${res.depart} → ${res.arrivee}`,
                                        Référence: res.id,
                                        Type: res.canal
                                    }));
                                    const worksheet = XLSX.utils.json_to_sheet(data);
                                    const workbook = XLSX.utils.book_new();
                                    XLSX.utils.book_append_sheet(workbook, worksheet, 'Réservations');
                                    XLSX.writeFile(workbook, 'Reservations.xlsx');
                                }, className: "bg-purple-600 text-white px-4 py-2 rounded", children: "\uD83D\uDCCA Excel" })] })] }), _jsxs("div", { id: "receipt", className: "border rounded-xl p-4 shadow", ref: receiptRef, children: [_jsx("h2", { className: "text-center font-bold text-lg mb-2", children: "LISTE DE R\u00C9SERVATION" }), selectedDate && selectedHoraire && (_jsx("div", { className: "text-center text-sm text-gray-600 mb-4", children: _jsxs("div", { children: [selectedDate, " \u2022 ", selectedHoraire, " \u2022 ", depart, " \u2192 ", arrivee] }) })), _jsxs("table", { className: "w-full text-sm border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "border p-2", children: "#" }), _jsx("th", { className: "border p-2", children: "Nom" }), _jsx("th", { className: "border p-2", children: "T\u00E9l\u00E9phone" }), _jsx("th", { className: "border p-2", children: "Lieux" }), _jsx("th", { className: "border p-2", children: "R\u00E9f\u00E9rence" }), _jsx("th", { className: "border p-2", children: "Type" })] }) }), _jsx("tbody", { children: filteredReservations.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "text-center p-4 text-gray-500", children: "Aucune r\u00E9servation pour ce trajet." }) })) : (filteredReservations.map((res, i) => (_jsxs("tr", { className: "hover:bg-yellow-50", children: [_jsx("td", { className: "border p-2 text-center", children: i + 1 }), _jsx("td", { className: "border p-2", children: res.nomClient }), _jsx("td", { className: "border p-2", children: res.telephone }), _jsxs("td", { className: "border p-2", children: [res.depart, " \u2192 ", res.arrivee] }), _jsx("td", { className: "border p-2", children: res.id.slice(0, 6) }), _jsxs("td", { className: "border p-2 text-center", children: [res.canal === 'guichet' ? '🧾 Guichet' : '🌐 En ligne', _jsx("br", {}), _jsx("button", { onClick: () => setReservationAModifier(res), className: "text-indigo-600 hover:underline text-xs mt-1", children: "\u270F\uFE0F Modifier" })] })] }, res.id)))) })] }), _jsx("div", { className: "mt-6 text-right text-sm italic", children: "Signature et cachet de la compagnie" })] }), reservationAModifier && (_jsx(ModifierReservationForm, { reservation: reservationAModifier, onClose: () => setReservationAModifier(null), onUpdated: fetchReservations }))] }));
};
export default AgenceReservationPage;
