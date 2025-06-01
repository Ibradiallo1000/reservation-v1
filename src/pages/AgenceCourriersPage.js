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
// ✅ AgenceCourriersPage.tsx – Liste imprimable des courriers pour un trajet précis
import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import * as XLSX from 'xlsx';
const AgenceCourriersPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const receiptRef = useRef(null);
    const [depart, setDepart] = useState('');
    const [arrivee, setArrivee] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [datesDisponibles, setDatesDisponibles] = useState([]);
    const [horaires, setHoraires] = useState([]);
    const [selectedHoraire, setSelectedHoraire] = useState('');
    const [courriers, setCourriers] = useState([]);
    const [trajetDetails, setTrajetDetails] = useState(null);
    const normalize = (str) => str.trim().toLowerCase();
    const generateNext8Days = () => {
        const today = new Date();
        return Array.from({ length: 8 }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            return d.toISOString().split('T')[0];
        });
    };
    const handleSearch = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!depart || !arrivee || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const snapshot = yield getDocs(collection(db, 'dailyTrips'));
        const results = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        const trajetsFiltres = results.filter(t => normalize(t.departure) === normalize(depart) &&
            normalize(t.arrival) === normalize(arrivee) &&
            t.companyId === user.companyId);
        const dates = Array.from(new Set(trajetsFiltres.map(t => t.date))).filter(d => generateNext8Days().includes(d));
        setDatesDisponibles(dates);
        if (dates.length > 0)
            setSelectedDate(dates[0]);
        else {
            setSelectedDate('');
            setHoraires([]);
            setSelectedHoraire('');
            setCourriers([]);
        }
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
        const heures = trajetsFiltres.filter(t => t.time).map(t => t.time);
        setHoraires(heures);
        if (heures.length > 0)
            setSelectedHoraire(heures[0]);
        else {
            setSelectedHoraire('');
            setCourriers([]);
        }
    });
    const fetchCourriers = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedHoraire || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const snapshot = yield getDocs(collection(db, 'dailyTrips'));
        const trajetsFiltres = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())))
            .filter(t => normalize(t.departure) === normalize(depart) &&
            normalize(t.arrival) === normalize(arrivee) &&
            t.date === selectedDate &&
            t.time === selectedHoraire &&
            t.companyId === user.companyId);
        if (trajetsFiltres.length === 0)
            return;
        const tripId = trajetsFiltres[0].id;
        setTrajetDetails(trajetsFiltres[0]);
        const resQuery = query(collection(db, 'courriers'), where('trajetId', '==', tripId), where('statut', '==', 'payé'));
        const resSnap = yield getDocs(resQuery);
        const list = resSnap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setCourriers(list);
    });
    const exportToPDF = () => {
        if (!receiptRef.current)
            return;
        html2pdf().from(receiptRef.current).save(`Courriers_${selectedDate}_${selectedHoraire}.pdf`);
    };
    const exportToExcel = () => {
        const data = courriers.map((c, i) => ({
            '#': i + 1,
            Expéditeur: c.expediteur,
            Téléphone: c.telephone,
            Destinataire: c.destinataire,
            Lieux: `${c.depart} → ${c.arrivee}`,
            Référence: c.id,
            Type: c.canal === 'guichet' ? 'Guichet' : 'En ligne'
        }));
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Courriers');
        XLSX.writeFile(workbook, `Courriers_${selectedDate}_${selectedHoraire}.xlsx`);
    };
    useEffect(() => {
        if (selectedDate)
            loadHoraires();
    }, [selectedDate]);
    useEffect(() => {
        if (selectedHoraire)
            fetchCourriers();
    }, [selectedHoraire]);
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Liste de Courriers" }), _jsxs("div", { className: "flex gap-3 mb-4", children: [_jsx("input", { type: "text", value: depart, onChange: e => setDepart(e.target.value), placeholder: "D\u00E9part", className: "border p-2 rounded" }), _jsx("input", { type: "text", value: arrivee, onChange: e => setArrivee(e.target.value), placeholder: "Arriv\u00E9e", className: "border p-2 rounded" }), _jsx("button", { onClick: handleSearch, className: "bg-yellow-500 text-white px-4 py-2 rounded", children: "Rechercher" })] }), datesDisponibles.length > 0 && (_jsx("div", { className: "flex gap-2 flex-wrap mb-4", children: datesDisponibles.map(date => (_jsx("button", { onClick: () => setSelectedDate(date), className: `px-3 py-1 rounded-full text-sm border ${selectedDate === date ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800'}`, children: date }, date))) })), horaires.length > 0 && (_jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "block text-sm mb-1", children: "Choisir une heure :" }), _jsx("select", { value: selectedHoraire, onChange: e => setSelectedHoraire(e.target.value), className: "border p-2 rounded", children: horaires.map(h => _jsx("option", { value: h, children: h }, h)) })] })), _jsxs("div", { className: "mb-4 flex justify-between gap-3 flex-wrap", children: [_jsx("button", { onClick: () => navigate(-1), className: "text-sm text-blue-500 underline", children: "\u2190 Retour" }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: exportToPDF, className: "bg-green-600 text-white px-4 py-2 rounded", children: "\uD83D\uDCC4 T\u00E9l\u00E9charger PDF" }), _jsx("button", { onClick: exportToExcel, className: "bg-purple-600 text-white px-4 py-2 rounded", children: "\uD83D\uDCCA Exporter Excel" })] })] }), _jsxs("div", { className: "border rounded-xl p-4", ref: receiptRef, children: [_jsx("h2", { className: "text-center font-bold text-lg mb-2", children: "LISTE DE COLIS / COURRIERS" }), _jsxs("div", { className: "text-center text-sm text-gray-600 mb-4", children: [selectedDate && selectedHoraire && (_jsxs("span", { children: [selectedDate, " \u2022 ", selectedHoraire, " \u2022 ", depart, " \u2192 ", arrivee] })), _jsx("br", {}), _jsxs("span", { children: [courriers.length, " colis"] })] }), _jsxs("table", { className: "w-full text-sm border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "border p-2", children: "#" }), _jsx("th", { className: "border p-2", children: "Exp\u00E9diteur" }), _jsx("th", { className: "border p-2", children: "T\u00E9l\u00E9phone" }), _jsx("th", { className: "border p-2", children: "Destinataire" }), _jsx("th", { className: "border p-2", children: "R\u00E9f\u00E9rence" }), _jsx("th", { className: "border p-2", children: "Type" })] }) }), _jsx("tbody", { children: courriers.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "text-center p-4 text-gray-500", children: "Aucun courrier pour ce trajet." }) })) : (courriers.map((c, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border p-2 text-center", children: i + 1 }), _jsx("td", { className: "border p-2", children: c.expediteur }), _jsx("td", { className: "border p-2", children: c.telephone }), _jsx("td", { className: "border p-2", children: c.destinataire }), _jsx("td", { className: "border p-2", children: c.id.slice(0, 6) }), _jsx("td", { className: "border p-2 text-center", children: c.canal === 'guichet' ? '🧾 Guichet' : '🌐 En ligne' })] }, c.id)))) })] }), _jsx("div", { className: "mt-6 text-right text-sm italic", children: "Signature et cachet de la compagnie" })] })] }));
};
export default AgenceCourriersPage;
