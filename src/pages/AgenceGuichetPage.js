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
import { useEffect, useState, useCallback } from 'react';
import { collection, getDocs, Timestamp, addDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
const MAX_SEATS = 30;
const DAYS_IN_ADVANCE = 8;
const DEFAULT_COMPANY_SLUG = 'compagnie-par-defaut';
const AgenceGuichetPage = () => {
    // Context and navigation
    const { user } = useAuth();
    const navigate = useNavigate();
    // State for search filters
    const [departure, setDeparture] = useState('');
    const [arrival, setArrival] = useState('');
    const [selectedDate, setSelectedDate] = useState('');
    // State for trips data
    const [trips, setTrips] = useState([]);
    const [filteredTrips, setFilteredTrips] = useState([]);
    const [allDepartures, setAllDepartures] = useState([]);
    const [allArrivals, setAllArrivals] = useState([]);
    // State for reservation
    const [selectedTrip, setSelectedTrip] = useState(null);
    const [nomClient, setNomClient] = useState('');
    const [telephone, setTelephone] = useState('');
    const [places, setPlaces] = useState(1);
    const [placesRetour, setPlacesRetour] = useState(0);
    const [tripType, setTripType] = useState('aller_simple');
    const [totalPrice, setTotalPrice] = useState(0);
    const [paiement, setPaiement] = useState('espèces');
    const [isProcessing, setIsProcessing] = useState(false);
    // Generate available dates (today + 7 days)
    const availableDates = Array.from({ length: DAYS_IN_ADVANCE }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() + i);
        return date.toISOString().split('T')[0];
    });
    // Check if a trip time is in the past
    const isPastTime = useCallback((date, time) => {
        const now = new Date();
        const [hours, minutes] = time.split(':').map(Number);
        const tripDate = new Date(date);
        tripDate.setHours(hours, minutes, 0, 0);
        return tripDate.getTime() < now.getTime();
    }, []);
    // Verify user company on component mount
    useEffect(() => {
        if (user && !user.companyId) {
            console.error('Aucune compagnie associée à cet utilisateur');
            alert('Votre compte n\'est associé à aucune compagnie. Contactez l\'administrateur.');
        }
    }, [user]);
    // Load all available cities
    useEffect(() => {
        const loadCities = () => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const snapshot = yield getDocs(collection(db, 'dailyTrips'));
                const allTrips = snapshot.docs.map(doc => doc.data());
                const uniqueDepartures = Array.from(new Set(allTrips.map((t) => t.departure)));
                const uniqueArrivals = Array.from(new Set(allTrips.map((t) => t.arrival)));
                setAllDepartures(uniqueDepartures);
                setAllArrivals(uniqueArrivals);
            }
            catch (error) {
                console.error('Error loading cities:', error);
            }
        });
        loadCities();
    }, []);
    // Calculate total price when relevant values change
    useEffect(() => {
        if (!selectedTrip) {
            setTotalPrice(0);
            return;
        }
        const basePrice = selectedTrip.price;
        let calculatedTotal = places * basePrice;
        if (tripType === 'aller_retour') {
            calculatedTotal += placesRetour * basePrice;
        }
        setTotalPrice(calculatedTotal);
    }, [places, placesRetour, tripType, selectedTrip]);
    // Handle search for trips
    const handleSearch = useCallback(() => __awaiter(void 0, void 0, void 0, function* () {
        if (!departure || !arrival) {
            alert('Veuillez sélectionner une ville de départ et une ville d\'arrivée');
            return;
        }
        try {
            const depLower = departure.trim().toLowerCase();
            const arrLower = arrival.trim().toLowerCase();
            // Get all trips matching the departure and arrival
            const snapshot = yield getDocs(collection(db, 'dailyTrips'));
            const allTrips = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            const matchingTrips = allTrips.filter(trip => {
                var _a, _b;
                return ((_a = trip.departure) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === depLower &&
                    ((_b = trip.arrival) === null || _b === void 0 ? void 0 : _b.toLowerCase()) === arrLower;
            });
            // Get reservations to calculate remaining seats
            const reservationsSnap = yield getDocs(collection(db, 'reservations'));
            const reservations = reservationsSnap.docs.map(doc => doc.data());
            // Process trips: filter valid dates, calculate remaining seats, exclude past times
            const processedTrips = matchingTrips
                .filter(trip => trip.date && availableDates.includes(trip.date))
                .map(trip => {
                const reservedSeats = reservations
                    .filter((res) => res.trajetId === trip.id && res.statut === 'payé')
                    .reduce((acc, res) => acc + (res.seatsGo || 1), 0);
                return Object.assign(Object.assign({}, trip), { remainingSeats: (trip.places || MAX_SEATS) - reservedSeats });
            })
                .filter(trip => !isPastTime(trip.date, trip.time))
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            setTrips(processedTrips);
            // Set default selected date to the first available date
            const firstAvailableDate = processedTrips.length > 0 ? processedTrips[0].date : '';
            setSelectedDate(firstAvailableDate);
            // Filter trips for the selected date
            if (firstAvailableDate) {
                const tripsForDate = processedTrips
                    .filter(trip => trip.date === firstAvailableDate)
                    .sort((a, b) => a.time.localeCompare(b.time));
                setFilteredTrips(tripsForDate);
            }
            else {
                setFilteredTrips([]);
            }
            setSelectedTrip(null);
        }
        catch (error) {
            console.error('Error searching trips:', error);
            alert('Une erreur est survenue lors de la recherche des trajets');
        }
    }), [departure, arrival, availableDates, isPastTime]);
    // Handle date selection
    const handleSelectDate = useCallback((date) => {
        setSelectedDate(date);
        const tripsForDate = trips
            .filter(trip => trip.date === date && !isPastTime(trip.date, trip.time))
            .sort((a, b) => a.time.localeCompare(b.time));
        setFilteredTrips(tripsForDate);
        setSelectedTrip(null);
    }, [trips, isPastTime]);
    // Handle trip selection
    const handleSelectTrip = useCallback((trip) => {
        setSelectedTrip(trip);
        setPlaces(1);
        setPlacesRetour(0);
    }, []);
    // Handle reservation submission
    const handleReservation = useCallback(() => __awaiter(void 0, void 0, void 0, function* () {
        if (!selectedTrip || !nomClient || !telephone || places < 1) {
            alert('Veuillez remplir tous les champs obligatoires');
            return;
        }
        if (!(user === null || user === void 0 ? void 0 : user.companyId)) {
            alert('Votre compte n\'est pas associé à une compagnie valide');
            return;
        }
        const totalSeats = tripType === 'aller_retour' ? places + placesRetour : places;
        if (selectedTrip.remainingSeats !== undefined && totalSeats > selectedTrip.remainingSeats) {
            alert(`Désolé, il ne reste que ${selectedTrip.remainingSeats} places disponibles.`);
            return;
        }
        setIsProcessing(true);
        try {
            let companySlug = DEFAULT_COMPANY_SLUG;
            let companyName = 'Compagnie';
            // Try to get company info if available
            const compagnieRef = doc(db, 'compagnies', user.companyId);
            const compagnieSnap = yield getDoc(compagnieRef);
            if (compagnieSnap.exists()) {
                companySlug = compagnieSnap.data().slug || DEFAULT_COMPANY_SLUG;
                companyName = compagnieSnap.data().nom || 'Compagnie';
            }
            else {
                console.warn(`Compagnie ${user.companyId} non trouvée, utilisation des valeurs par défaut`);
            }
            // Create reservation document
            const reservationData = {
                trajetId: selectedTrip.id,
                nomClient,
                telephone,
                seatsGo: places,
                seatsReturn: tripType === 'aller_retour' ? placesRetour : 0,
                date: selectedTrip.date,
                heure: selectedTrip.time,
                depart: selectedTrip.departure,
                arrivee: selectedTrip.arrival,
                montant: totalPrice,
                statut: 'payé',
                compagnieId: user.companyId,
                compagnieNom: companyName,
                agencyId: user.agencyId || null,
                createdAt: Timestamp.now(),
                canal: 'guichet',
                tripType,
                paiement,
                companySlug: companySlug
            };
            const docRef = yield addDoc(collection(db, 'reservations'), reservationData);
            navigate(`/agence/receipt/${docRef.id}`);
        }
        catch (error) {
            console.error('Erreur création réservation:', error);
            let errorMessage = 'Erreur lors de la réservation';
            if (error instanceof Error) {
                errorMessage += `: ${error.message}`;
            }
            alert(errorMessage);
        }
        finally {
            setIsProcessing(false);
        }
    }), [selectedTrip, nomClient, telephone, user, places, placesRetour, tripType, totalPrice, paiement, navigate]);
    // Get unique available dates from trips
    const availableTripDates = Array.from(new Set(trips.map(trip => trip.date)));
    return (_jsxs("div", { className: "p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 min-h-screen", children: [_jsxs("div", { className: "lg:col-span-2 space-y-6", children: [_jsxs("header", { className: "space-y-2", children: [_jsx("h1", { className: "text-3xl font-bold text-gray-800", children: "\uD83C\uDF9B Guichet \u2013 Vente de billets" }), _jsx("p", { className: "text-gray-600", children: "Recherchez et r\u00E9servez des billets pour vos clients" })] }), _jsxs("section", { className: "bg-white p-4 rounded-xl shadow", children: [_jsx("h2", { className: "text-xl font-semibold mb-3 text-gray-800", children: "\uD83D\uDD0D Rechercher un trajet" }), _jsxs("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-4", children: [_jsxs("div", { children: [_jsx("label", { htmlFor: "departure", className: "block text-sm font-medium text-gray-700 mb-1", children: "D\u00E9part" }), _jsx("input", { id: "departure", list: "depList", value: departure, onChange: (e) => setDeparture(e.target.value), placeholder: "Ville de d\u00E9part", className: "w-full border px-3 py-2 rounded focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500" }), _jsx("datalist", { id: "depList", children: allDepartures.map(city => (_jsx("option", { value: city }, `dep-${city}`))) })] }), _jsxs("div", { children: [_jsx("label", { htmlFor: "arrival", className: "block text-sm font-medium text-gray-700 mb-1", children: "Arriv\u00E9e" }), _jsx("input", { id: "arrival", list: "arrList", value: arrival, onChange: (e) => setArrival(e.target.value), placeholder: "Ville d'arriv\u00E9e", className: "w-full border px-3 py-2 rounded focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500" }), _jsx("datalist", { id: "arrList", children: allArrivals.map(city => (_jsx("option", { value: city }, `arr-${city}`))) })] }), _jsx("div", { className: "flex items-end", children: _jsx("button", { onClick: handleSearch, className: "w-full bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-4 py-2 rounded transition-colors duration-200", children: "Rechercher" }) })] })] }), trips.length > 0 && (_jsxs("section", { className: "bg-white p-4 rounded-xl shadow", children: [_jsx("h2", { className: "text-xl font-semibold mb-3 text-gray-800", children: "\uD83D\uDCC5 Dates disponibles" }), _jsx("div", { className: "flex flex-wrap gap-2", children: availableDates.map(date => {
                                    const isAvailable = availableTripDates.includes(date);
                                    const isSelected = selectedDate === date;
                                    return (_jsx("button", { onClick: () => isAvailable && handleSelectDate(date), className: `px-3 py-1 rounded-full text-sm border shadow-sm transition-colors duration-200 ${isSelected
                                            ? 'bg-yellow-600 text-white border-yellow-700'
                                            : isAvailable
                                                ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200'
                                                : 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed'}`, disabled: !isAvailable, title: isAvailable ? `Voir les trajets pour le ${date}` : 'Date non disponible', children: new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) }, date));
                                }) })] })), _jsxs("section", { className: "bg-white p-4 rounded-xl shadow", children: [_jsx("h2", { className: "text-xl font-semibold mb-3 text-gray-800", children: "\uD83D\uDD52 Horaires disponibles" }), filteredTrips.length === 0 ? (_jsx("div", { className: "text-center py-8", children: _jsx("p", { className: "text-gray-500", children: trips.length === 0
                                        ? 'Aucun trajet trouvé. Veuillez effectuer une recherche.'
                                        : 'Aucun horaire disponible pour cette date.' }) })) : (_jsx("ul", { className: "divide-y divide-gray-200", children: filteredTrips.map(trip => {
                                    var _a;
                                    return (_jsx("li", { onClick: () => handleSelectTrip(trip), className: `py-3 px-2 cursor-pointer transition-colors duration-200 ${(selectedTrip === null || selectedTrip === void 0 ? void 0 : selectedTrip.id) === trip.id
                                            ? 'bg-yellow-100 border-l-4 border-yellow-500'
                                            : 'hover:bg-gray-50'}`, children: _jsxs("div", { className: "flex justify-between items-start", children: [_jsxs("div", { children: [_jsxs("p", { className: "font-bold", children: [_jsx("span", { className: "text-lg", children: trip.time }), " \u2014 ", trip.departure, " \u2192 ", trip.arrival] }), _jsx("p", { className: "text-sm text-gray-600", children: new Date(trip.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) })] }), _jsxs("div", { className: "text-right", children: [_jsxs("p", { className: "font-semibold text-yellow-700", children: [trip.price.toLocaleString('fr-FR'), " FCFA"] }), _jsxs("p", { className: "text-xs text-gray-500", children: [(_a = trip.remainingSeats) !== null && _a !== void 0 ? _a : 'NC', " places restantes"] })] })] }) }, trip.id));
                                }) }))] })] }), _jsxs("div", { className: "bg-white p-6 rounded-xl shadow space-y-4 sticky top-6 h-fit", children: [_jsx("h2", { className: "text-xl font-semibold text-gray-800", children: "\uD83E\uDDCD\u200D\u2642\uFE0F D\u00E9tails du passager" }), selectedTrip ? (_jsxs("div", { className: "text-sm text-gray-700 bg-yellow-50 rounded-lg border-l-4 border-yellow-500 p-3 space-y-1", children: [_jsxs("p", { className: "font-medium", children: [selectedTrip.departure, " \u2192 ", selectedTrip.arrival] }), _jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Date:" }), " ", new Date(selectedTrip.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })] }), _jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Heure:" }), " ", selectedTrip.time] }), _jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Prix unitaire:" }), " ", selectedTrip.price.toLocaleString('fr-FR'), " FCFA"] }), selectedTrip.remainingSeats !== undefined && (_jsxs("p", { children: [_jsx("span", { className: "font-medium", children: "Places restantes:" }), " ", selectedTrip.remainingSeats] }))] })) : (_jsx("div", { className: "text-center py-4 bg-gray-50 rounded-lg text-gray-500", children: "S\u00E9lectionnez un trajet pour continuer" })), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { onClick: () => setTripType('aller_simple'), className: `flex-1 py-2 rounded transition-colors duration-200 ${tripType === 'aller_simple'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`, children: "Aller simple" }), _jsx("button", { onClick: () => setTripType('aller_retour'), className: `flex-1 py-2 rounded transition-colors duration-200 ${tripType === 'aller_retour'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`, children: "Aller-retour" })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Nom complet du passager*" }), _jsx("input", { type: "text", value: nomClient, onChange: (e) => setNomClient(e.target.value), className: "w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500", required: true })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Num\u00E9ro de t\u00E9l\u00E9phone*" }), _jsx("input", { type: "tel", value: telephone, onChange: (e) => setTelephone(e.target.value), className: "w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500", required: true })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Nombre de places (Aller)*" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setPlaces(p => Math.max(1, p - 1)), className: "px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200", disabled: !selectedTrip, children: "-" }), _jsx("span", { className: "w-8 text-center", children: places }), _jsx("button", { onClick: () => setPlaces(p => p + 1), className: "px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200", disabled: !selectedTrip || (selectedTrip.remainingSeats !== undefined && places >= selectedTrip.remainingSeats), children: "+" })] })] }), tripType === 'aller_retour' && (_jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Nombre de places (Retour)" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { onClick: () => setPlacesRetour(p => Math.max(0, p - 1)), className: "px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200", disabled: !selectedTrip, children: "-" }), _jsx("span", { className: "w-8 text-center", children: placesRetour }), _jsx("button", { onClick: () => setPlacesRetour(p => p + 1), className: "px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200", disabled: !selectedTrip || (selectedTrip.remainingSeats !== undefined && (places + placesRetour) >= selectedTrip.remainingSeats), children: "+" })] })] })), _jsxs("div", { className: "pt-2 border-t border-gray-200 space-y-2", children: [_jsxs("div", { className: "flex justify-between items-center", children: [_jsx("span", { className: "text-sm font-medium text-gray-700", children: "Total \u00E0 payer" }), _jsxs("span", { className: "text-xl font-bold text-green-600", children: [totalPrice.toLocaleString('fr-FR'), " FCFA"] })] }), _jsxs("div", { className: "space-y-2", children: [_jsx("label", { className: "block text-sm font-medium text-gray-700", children: "Mode de paiement" }), _jsxs("select", { value: paiement, onChange: (e) => setPaiement(e.target.value), className: "w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500", children: [_jsx("option", { value: "esp\u00E8ces", children: "Esp\u00E8ces" }), _jsx("option", { value: "mobile_money", children: "Mobile Money" })] })] })] }), _jsx("button", { onClick: handleReservation, disabled: !selectedTrip || !nomClient || !telephone || places < 1 || isProcessing, className: `w-full py-3 px-4 rounded font-semibold transition-colors duration-200 flex items-center justify-center ${!selectedTrip || !nomClient || !telephone || places < 1
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700 text-white'}`, children: isProcessing ? (_jsxs(_Fragment, { children: [_jsxs("svg", { className: "animate-spin -ml-1 mr-3 h-5 w-5 text-white", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })] }), "Traitement..."] })) : ('✅ Valider la réservation') })] })] }));
};
export default AgenceGuichetPage;
