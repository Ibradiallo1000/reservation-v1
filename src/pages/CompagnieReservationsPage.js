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
// ✅ src/pages/CompagnieReservationsPage.tsx (corrigé complet)
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
const CompagnieReservationsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [agences, setAgences] = useState([]);
    const [agencyId, setAgencyId] = useState('');
    const [depart, setDepart] = useState('');
    const [arrivee, setArrivee] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    const [datesDisponibles, setDatesDisponibles] = useState([]);
    const [horaires, setHoraires] = useState([]);
    const [selectedHoraire, setSelectedHoraire] = useState('');
    const [reservations, setReservations] = useState([]);
    const [companyName, setCompanyName] = useState('');
    const normalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const generateNext8Days = () => {
        const today = new Date();
        return Array.from({ length: 8 }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            return d.toISOString().split('T')[0];
        });
    };
    const loadAgences = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
        const snap = yield getDocs(q);
        const data = snap.docs.map(doc => ({ id: doc.id, nom: doc.data().ville }));
        setAgences(data);
    });
    const handleSearch = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!agencyId || !depart || !arrivee || !(user === null || user === void 0 ? void 0 : user.companyId))
            return;
        const q = query(collection(db, 'dailyTrips'), where('agencyId', '==', agencyId), where('departure', '==', normalize(depart)), where('arrival', '==', normalize(arrivee)));
        const snap = yield getDocs(q);
        const foundDates = new Set();
        snap.forEach(doc => {
            const data = doc.data();
            if (data.date)
                foundDates.add(data.date);
        });
        const filteredDates = Array.from(foundDates).filter(d => generateNext8Days().includes(d)).sort();
        setDatesDisponibles(filteredDates);
        setSelectedDate(filteredDates[0] || '');
        setHoraires([]);
        setSelectedHoraire('');
        setReservations([]);
    });
    const loadHoraires = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedDate || !agencyId || !depart || !arrivee)
            return;
        const q = query(collection(db, 'dailyTrips'), where('agencyId', '==', agencyId), where('departure', '==', normalize(depart)), where('arrival', '==', normalize(arrivee)), where('date', '==', selectedDate));
        const snap = yield getDocs(q);
        const times = [];
        snap.forEach(doc => times.push(doc.data().time));
        setHoraires(times);
        setSelectedHoraire(times[0] || '');
    });
    const fetchReservations = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedHoraire || !selectedDate)
            return;
        const qTrip = query(collection(db, 'dailyTrips'), where('agencyId', '==', agencyId), where('departure', '==', normalize(depart)), where('arrival', '==', normalize(arrivee)), where('date', '==', selectedDate), where('time', '==', selectedHoraire));
        const tripSnap = yield getDocs(qTrip);
        if (tripSnap.empty)
            return;
        const tripId = tripSnap.docs[0].id;
        const qRes = query(collection(db, 'reservations'), where('trajetId', '==', tripId), where('statut', '==', 'payé'));
        const resSnap = yield getDocs(qRes);
        const data = resSnap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        setReservations(data);
    });
    useEffect(() => {
        if (selectedDate)
            loadHoraires();
    }, [selectedDate]);
    useEffect(() => {
        if (selectedHoraire)
            fetchReservations();
    }, [selectedHoraire]);
    useEffect(() => {
        loadAgences();
        if (user === null || user === void 0 ? void 0 : user.companyId) {
            getDoc(doc(db, 'companies', user.companyId)).then(snap => {
                if (snap.exists())
                    setCompanyName(snap.data().nom);
            });
        }
    }, []);
    const totalPlaces = reservations.reduce((total, r) => total + (r.seatsGo || 1), 0);
    const totalEncaisse = reservations.reduce((total, r) => total + (r.montant || 0), 0);
    if (!user)
        return _jsx("div", { className: "p-6", children: "Chargement des donn\u00E9es..." });
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-4", children: "Toutes les r\u00E9servations de la compagnie" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4", children: [_jsxs("select", { value: agencyId, onChange: e => setAgencyId(e.target.value), className: "border p-2 rounded", children: [_jsx("option", { value: "", children: "S\u00E9lectionner une agence" }), agences.map(a => _jsx("option", { value: a.id, children: a.nom }, a.id))] }), _jsx("input", { value: depart, onChange: e => setDepart(e.target.value), placeholder: "D\u00E9part", className: "border p-2 rounded" }), _jsx("input", { value: arrivee, onChange: e => setArrivee(e.target.value), placeholder: "Arriv\u00E9e", className: "border p-2 rounded" }), _jsx("button", { onClick: handleSearch, className: "bg-yellow-500 text-white rounded px-4", children: "Rechercher" })] }), datesDisponibles.length > 0 && (_jsx("div", { className: "flex gap-2 flex-wrap mb-4", children: datesDisponibles.map(date => (_jsx("button", { onClick: () => setSelectedDate(date), className: `px-3 py-1 rounded-full text-sm border ${selectedDate === date ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800'}`, children: date }, date))) })), horaires.length > 0 && (_jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "text-sm", children: "Choisir une heure :" }), _jsx("select", { value: selectedHoraire, onChange: e => setSelectedHoraire(e.target.value), className: "border p-2 rounded", children: horaires.map(h => _jsx("option", { value: h, children: h }, h)) })] })), _jsxs("div", { className: "mb-4 flex justify-between", children: [_jsx("button", { onClick: () => navigate(-1), className: "text-sm text-blue-500 underline", children: "\u2190 Retour" }), _jsx("button", { onClick: () => window.print(), className: "bg-blue-600 text-white px-4 py-2 rounded", children: "Imprimer" })] }), _jsxs("div", { className: "border rounded-xl p-4", children: [_jsxs("h2", { className: "text-center font-bold text-lg mb-2", children: [(companyName || 'COMPAGNIE').toUpperCase(), " - LISTE GLOBALE DES R\u00C9SERVATIONS"] }), _jsxs("div", { className: "text-center text-sm text-gray-600 mb-4", children: [selectedDate && selectedHoraire && (_jsxs("span", { children: [selectedDate, " \u2022 ", selectedHoraire, " \u2022 ", depart, " \u2192 ", arrivee] })), _jsx("br", {}), _jsxs("span", { children: [reservations.length, " r\u00E9servations \u2014 ", totalPlaces, " passagers \u2014 ", totalEncaisse, " FCFA"] })] }), _jsxs("table", { className: "w-full text-sm border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "border p-2", children: "#" }), _jsx("th", { className: "border p-2", children: "Nom" }), _jsx("th", { className: "border p-2", children: "T\u00E9l\u00E9phone" }), _jsx("th", { className: "border p-2", children: "Trajet" }), _jsx("th", { className: "border p-2", children: "Date" }), _jsx("th", { className: "border p-2", children: "Heure" }), _jsx("th", { className: "border p-2", children: "Canal" })] }) }), _jsx("tbody", { children: reservations.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "text-center p-4 text-gray-500", children: "Aucune r\u00E9servation trouv\u00E9e." }) })) : (reservations.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border p-2 text-center", children: i + 1 }), _jsx("td", { className: "border p-2", children: r.nomClient }), _jsx("td", { className: "border p-2", children: r.telephone }), _jsxs("td", { className: "border p-2", children: [r.depart, " \u2192 ", r.arrivee] }), _jsx("td", { className: "border p-2", children: r.date }), _jsx("td", { className: "border p-2", children: r.heure }), _jsx("td", { className: "border p-2 text-center", children: r.canal === 'guichet' ? '🧾 Guichet' : '🌐 En ligne' })] }, r.id)))) })] }), _jsx("div", { className: "mt-6 text-right text-sm italic", children: "Signature et cachet de la compagnie" })] })] }));
};
export default CompagnieReservationsPage;
