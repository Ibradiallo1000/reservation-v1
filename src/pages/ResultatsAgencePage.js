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
// ✅ ResultatsAgencePage.tsx avec désactivation des heures passées et saut automatique de date
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const ResultatsAgencePage = () => {
    const navigate = useNavigate();
    const { slug } = useParams();
    const [searchParams] = useSearchParams();
    const departureParam = searchParams.get('departure') || '';
    const arrivalParam = searchParams.get('arrival') || '';
    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    const departure = capitalize(departureParam);
    const arrival = capitalize(arrivalParam);
    const [company, setCompany] = useState(null);
    const [agence, setAgence] = useState(null);
    const [groupedTrajets, setGroupedTrajets] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [dates, setDates] = useState([]);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const getNextNDates = (n) => {
        const today = new Date();
        return Array.from({ length: n }, (_, i) => {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            return d.toISOString().split('T')[0];
        });
    };
    useEffect(() => {
        const fetchCompanyAndAgence = () => __awaiter(void 0, void 0, void 0, function* () {
            const q = query(collection(db, 'companies'), where('slug', '==', slug));
            const snapshot = yield getDocs(q);
            if (snapshot.empty) {
                setError("Aucune agence trouvée pour ce lien.");
                setLoading(false);
                return;
            }
            const doc = snapshot.docs[0];
            const data = doc.data();
            const companyId = doc.id;
            setCompany({ id: companyId, nom: data.nom, pays: data.pays, slug: data.slug });
            const agenceQuery = query(collection(db, 'agences'), where('companyId', '==', companyId));
            const agencesSnapshot = yield getDocs(agenceQuery);
            if (!agencesSnapshot.empty) {
                const agenceDoc = agencesSnapshot.docs[0];
                const agenceData = agenceDoc.data();
                setAgence({
                    id: agenceDoc.id,
                    ville: agenceData.ville,
                    quartier: agenceData.quartier,
                    pays: agenceData.pays,
                    telephone: agenceData.telephone,
                    nomAgence: agenceData.nomAgence,
                });
            }
            setLoading(false);
        });
        fetchCompanyAndAgence();
    }, [slug]);
    useEffect(() => {
        const fetchTrajets = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!departure || !arrival || !(agence === null || agence === void 0 ? void 0 : agence.id))
                return;
            setLoading(true);
            try {
                const allDates = getNextNDates(8);
                const q = query(collection(db, 'dailyTrips'));
                const snapshot = yield getDocs(q);
                const allTrajets = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
                const reservationsSnap = yield getDocs(collection(db, 'reservations'));
                const reservations = reservationsSnap.docs.map(doc => doc.data());
                const trajetsValides = allTrajets.filter(doc => {
                    var _a, _b;
                    return ((_a = doc.departure) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase()) === departure.toLowerCase() &&
                        ((_b = doc.arrival) === null || _b === void 0 ? void 0 : _b.trim().toLowerCase()) === arrival.toLowerCase() &&
                        doc.agencyId === agence.id &&
                        allDates.includes(doc.date);
                }).map(trajet => {
                    const reserved = reservations.filter(r => r.trajetId === trajet.id && r.statut === 'payé')
                        .reduce((acc, r) => acc + (r.seatsGo || 1), 0);
                    return Object.assign(Object.assign({}, trajet), { places: (trajet.places || 30) - reserved });
                });
                const trajetsParDate = {};
                trajetsValides.forEach(trajet => {
                    if (!trajetsParDate[trajet.date])
                        trajetsParDate[trajet.date] = [];
                    trajetsParDate[trajet.date].push(trajet);
                });
                const now = new Date();
                const availableDates = allDates.filter(date => {
                    const trajets = trajetsParDate[date];
                    if (!trajets)
                        return false;
                    return trajets.some(t => new Date(`${t.date}T${t.time}`) > now);
                });
                setDates(availableDates);
                setSelectedDate(prev => (availableDates.includes(prev) ? prev : availableDates[0]));
                const grouped = {};
                for (const t of trajetsValides) {
                    if (new Date(`${t.date}T${t.time}`) > now) {
                        const key = `${t.companyId}`;
                        if (!grouped[key])
                            grouped[key] = [];
                        grouped[key].push(t);
                    }
                }
                setGroupedTrajets(grouped);
            }
            catch (err) {
                console.error('🚨 Erreur Firestore :', err);
                setError('Erreur lors du chargement des trajets.');
            }
            finally {
                setLoading(false);
            }
        });
        fetchTrajets();
    }, [departure, arrival, agence]);
    const filteredGrouped = Object.fromEntries(Object.entries(groupedTrajets).map(([key, trajets]) => [
        key,
        trajets.filter((t) => t.date === selectedDate),
    ]));
    useEffect(() => {
        var _a;
        const todayTrips = Object.values(filteredGrouped).flat().filter(t => t.date === selectedDate);
        if (todayTrips.length > 0) {
            const sorted = todayTrips.sort((a, b) => a.time.localeCompare(b.time));
            const defaultTime = ((_a = sorted[0]) === null || _a === void 0 ? void 0 : _a.time) || '';
            setSelectedTime(prev => {
                const isStillValid = todayTrips.some(t => t.time === prev);
                return isStillValid ? prev : defaultTime;
            });
        }
        else {
            setSelectedTime('');
        }
    }, [selectedDate, filteredGrouped]);
    const isPastTime = (date, time) => {
        const dt = new Date(`${date}T${time}`);
        return dt.getTime() < new Date().getTime();
    };
    if (error) {
        return (_jsxs("div", { className: "text-center py-10 text-red-600", children: [error, " ", _jsx("br", {}), _jsx("button", { onClick: () => navigate('/'), className: "mt-4 underline text-sm text-blue-700", children: "\u21A9 Retour \u00E0 l\u2019accueil" })] }));
    }
    if (loading) {
        return _jsx("div", { className: "text-center py-10 text-gray-600", children: "Chargement..." });
    }
    return (_jsxs("div", { className: "p-4 sm:p-6 max-w-5xl mx-auto", children: [_jsxs("div", { className: "text-center mb-4", children: [_jsx("h1", { className: "text-xl sm:text-2xl font-semibold text-gray-800", children: "Veuillez choisir votre date de d\u00E9part ci-dessous" }), agence && (_jsxs("div", { className: "bg-gray-50 mt-2 p-3 rounded-md shadow-sm text-xs text-gray-600", children: ["\uD83D\uDCCD Agence : ", agence.nomAgence, " (", agence.ville, ", ", agence.pays, ") | \u260E ", agence.telephone] }))] }), _jsx("div", { className: "flex gap-2 overflow-x-auto scrollbar-hide mb-6 px-1", children: dates.map(date => (_jsx("button", { onClick: () => setSelectedDate(date), className: `min-w-[110px] px-4 py-2 border rounded-full text-sm flex-shrink-0 transition ${selectedDate === date
                        ? 'bg-yellow-500 text-white font-semibold'
                        : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'}`, children: new Date(date).toLocaleDateString() }, date))) }), Object.keys(filteredGrouped).length === 0 ? (_jsx("p", { className: "text-center text-red-600", children: "Aucun trajet trouv\u00E9 pour cette date." })) : (Object.entries(filteredGrouped).map(([key, trajets]) => (_jsxs("div", { className: "border rounded-lg p-4 mb-6 shadow-sm bg-white", children: [_jsxs("h2", { className: "text-base font-semibold text-gray-800 mb-3", children: [(agence === null || agence === void 0 ? void 0 : agence.nomAgence) || 'Agence', " \u2013 ", agence === null || agence === void 0 ? void 0 : agence.ville, ", ", agence === null || agence === void 0 ? void 0 : agence.quartier, " \u2013 ", agence === null || agence === void 0 ? void 0 : agence.telephone] }), _jsx("h3", { className: "text-sm font-medium text-gray-700 mb-2", children: "Choisissez une heure :" }), !selectedTime && _jsx("p", { className: "text-red-500 text-sm", children: "Aucune heure s\u00E9lectionn\u00E9e." }), _jsx("div", { className: "flex flex-wrap gap-4 mb-4", children: trajets
                            .sort((a, b) => a.time.localeCompare(b.time))
                            .map(t => (_jsxs("label", { className: "flex items-center gap-2", children: [_jsx("input", { type: "radio", name: "selectedTime", value: t.time, checked: selectedTime === t.time, onChange: () => setSelectedTime(t.time), disabled: isPastTime(t.date, t.time) }), _jsx("span", { className: `font-medium ${isPastTime(t.date, t.time) ? 'text-gray-400' : 'text-blue-700'}`, children: t.time })] }, t.id))) }, selectedDate + selectedTime), trajets
                        .filter(t => t.time === selectedTime && !isPastTime(t.date, t.time))
                        .map(t => (_jsxs("div", { className: "space-y-2 text-sm text-gray-700", children: [_jsxs("p", { children: ["\uD83D\uDEE3\uFE0F ", _jsx("strong", { children: "Trajet :" }), " ", t.departure, " \u2192 ", t.arrival] }), _jsxs("p", { children: ["\uD83D\uDCC5 ", _jsx("strong", { children: "Date :" }), " ", t.date] }), _jsxs("p", { children: ["\uD83D\uDCB0 ", _jsx("strong", { children: "Prix :" }), " ", _jsxs("span", { className: "bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full", children: [t.price.toLocaleString(), " FCFA"] }), ' ', "| ", _jsx("strong", { children: "Places :" }), ' ', _jsx("span", { className: `font-bold ${t.places === 0 ? 'text-red-600' : t.places <= 10 ? 'text-yellow-600' : 'text-green-600'}`, children: t.places })] }), _jsx("button", { onClick: () => navigate('/compagnie/' + slug + '/booking', {
                                    state: Object.assign(Object.assign({}, t), { tripId: t.id, companyId: company === null || company === void 0 ? void 0 : company.id, company: company === null || company === void 0 ? void 0 : company.nom, logoUrl: t.logoUrl || '' })
                                }), className: "mt-4 w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700", children: "R\u00E9server" })] }, t.id)))] }, key)))), _jsx("div", { className: "text-center mt-8", children: _jsx("button", { onClick: () => navigate(`/compagnie/${slug}`), className: "text-sm text-blue-600 hover:underline", children: "\u21A9 Retour \u00E0 la vitrine" }) })] }));
};
export default ResultatsAgencePage;
