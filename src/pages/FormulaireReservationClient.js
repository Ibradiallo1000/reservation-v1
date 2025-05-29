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
// ✅ FormulaireReservationClient.tsx – anciennement BookingPage.tsx
import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const FormulaireReservationClient = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { slug = '' } = useParams();
    const tripData = location.state;
    const [passengerData, setPassengerData] = useState({
        fullName: '',
        phone: '',
        email: '',
    });
    const [seatsGo, setSeatsGo] = useState(1);
    const [seatsReturn, setSeatsReturn] = useState(1);
    const [tripType, setTripType] = useState('aller_simple');
    const [isPaying, setIsPaying] = useState(false);
    const [totalCost, setTotalCost] = useState((tripData === null || tripData === void 0 ? void 0 : tripData.price) || 0);
    const unitPrice = Number((tripData === null || tripData === void 0 ? void 0 : tripData.price) || 0);
    useEffect(() => {
        const go = seatsGo || 0;
        const ret = tripType === 'aller_retour' ? (seatsReturn || 0) : 0;
        const total = unitPrice * (go + ret);
        setTotalCost(total);
    }, [seatsGo, seatsReturn, tripType, tripData]);
    if (!tripData || !tripData.tripId) {
        return _jsx("div", { className: "text-center p-8 text-red-600 font-semibold", children: "Donn\u00E9es du voyage introuvables." });
    }
    const handlePassengerChange = (e) => {
        const { name, value } = e.target;
        setPassengerData((prev) => (Object.assign(Object.assign({}, prev), { [name]: value })));
    };
    const increment = (setter, value) => {
        if (value < 10)
            setter(value + 1);
    };
    const decrement = (setter, value) => {
        if (value > 1)
            setter(value - 1);
    };
    const handlePayment = (e) => __awaiter(void 0, void 0, void 0, function* () {
        e.preventDefault();
        if (!passengerData.fullName || !passengerData.phone || seatsGo < 1 || (tripType === 'aller_retour' && seatsReturn < 1)) {
            alert('Veuillez remplir correctement tous les champs obligatoires.');
            return;
        }
        setIsPaying(true);
        try {
            const trajetRef = doc(db, 'dailyTrips', tripData.tripId);
            const trajetSnap = yield getDoc(trajetRef);
            if (!trajetSnap.exists()) {
                alert('Trajet introuvable.');
                return;
            }
            const trajet = trajetSnap.data();
            const placesRestantes = trajet.places || 0;
            const totalPlacesDemandées = seatsGo + (tripType === 'aller_retour' ? seatsReturn : 0);
            if (placesRestantes < totalPlacesDemandées) {
                alert(`Il ne reste que ${placesRestantes} place(s) disponible(s) pour ce trajet.`);
                return;
            }
            const agenceRef = doc(db, 'agences', tripData.agencyId);
            const agenceSnap = yield getDoc(agenceRef);
            if (!agenceSnap.exists()) {
                alert("Agence introuvable.");
                return;
            }
            const agenceData = agenceSnap.data();
            const commissionRate = agenceData.commissionRate || 0.05;
            const companySlug = agenceData.slug || slug;
            const booking = {
                nomClient: passengerData.fullName,
                telephone: passengerData.phone,
                email: passengerData.email,
                depart: tripData.departure || '',
                arrivee: tripData.arrival || '',
                date: tripData.date || '',
                heure: tripData.time || '',
                montant: totalCost,
                seatsGo,
                seatsReturn: tripType === 'aller_retour' ? seatsReturn : 0,
                tripType,
                canal: 'en_ligne',
                statut: 'payé',
                createdAt: Timestamp.now(),
                companyId: tripData.companyId || null,
                agencyId: tripData.agencyId || null,
                trajetId: tripData.tripId,
                paiement: 'mobile_money',
                commission: totalCost * commissionRate,
                companySlug: slug || agenceData.slug || '',
            };
            const docRef = yield addDoc(collection(db, 'reservations'), booking);
            yield updateDoc(trajetRef, {
                places: placesRestantes - totalPlacesDemandées
            });
            navigate(`/reservation-confirmation/${docRef.id}`, { state: { slug: companySlug } });
        }
        catch (error) {
            console.error('Erreur Firestore complète :', error);
            alert('Erreur Firestore : ' + ((error === null || error === void 0 ? void 0 : error.message) || 'inconnue'));
        }
        finally {
            setIsPaying(false);
        }
    });
    return (_jsxs("div", { className: "container mx-auto px-4 py-8", children: [_jsxs("div", { className: "bg-white rounded-lg shadow-md p-6 mb-6 text-center", children: [tripData.logoUrl && (_jsx("img", { src: tripData.logoUrl, alt: "Logo Compagnie", className: "h-20 mx-auto mb-2" })), _jsx("h2", { className: "text-xl font-bold mb-2", children: tripData.company }), _jsxs("p", { className: "text-gray-600 mb-1", children: [tripData.departure, " \u2192 ", tripData.arrival] }), _jsxs("p", { className: "text-gray-600 mb-1", children: ["Date : ", tripData.date, " \u2014 Heure : ", tripData.time] }), _jsxs("p", { className: "text-gray-600 mb-1", children: ["Dur\u00E9e : ", tripData.duration || 'Non précisée'] }), _jsxs("p", { className: "text-lg font-bold mt-2", children: ["Prix unitaire : ", unitPrice.toLocaleString(), " FCFA"] })] }), _jsxs("form", { onSubmit: handlePayment, className: "bg-white rounded-lg shadow-md p-6", children: [_jsx("h2", { className: "text-xl font-semibold mb-4", children: "Informations du passager principal" }), _jsxs("div", { className: "space-y-4", children: [_jsx("input", { type: "text", name: "fullName", value: passengerData.fullName, onChange: handlePassengerChange, placeholder: "Nom complet *", className: "block w-full rounded border px-3 py-2", required: true }), _jsx("input", { type: "tel", name: "phone", value: passengerData.phone, onChange: handlePassengerChange, placeholder: "T\u00E9l\u00E9phone *", className: "block w-full rounded border px-3 py-2", required: true }), _jsx("input", { type: "email", name: "email", value: passengerData.email, onChange: handlePassengerChange, placeholder: "Email", className: "block w-full rounded border px-3 py-2" }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-sm", children: "Lieux (aller)" }), _jsx("button", { type: "button", className: "px-2 py-1 bg-gray-200 rounded", onClick: () => decrement(setSeatsGo, seatsGo), children: "-" }), _jsx("span", { className: "font-semibold", children: seatsGo }), _jsx("button", { type: "button", className: "px-2 py-1 bg-gray-200 rounded", onClick: () => increment(setSeatsGo, seatsGo), children: "+" })] }), tripType === 'aller_retour' && (_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("span", { className: "text-sm", children: "Lieux (retour)" }), _jsx("button", { type: "button", className: "px-2 py-1 bg-gray-200 rounded", onClick: () => decrement(setSeatsReturn, seatsReturn), children: "-" }), _jsx("span", { className: "font-semibold", children: seatsReturn }), _jsx("button", { type: "button", className: "px-2 py-1 bg-gray-200 rounded", onClick: () => increment(setSeatsReturn, seatsReturn), children: "+" })] })), _jsxs("div", { className: "flex gap-4 mt-2", children: [_jsxs("label", { className: "inline-flex items-center", children: [_jsx("input", { type: "radio", value: "aller_simple", checked: tripType === 'aller_simple', onChange: () => setTripType('aller_simple') }), _jsx("span", { className: "ml-2", children: "Aller simple" })] }), _jsxs("label", { className: "inline-flex items-center", children: [_jsx("input", { type: "radio", value: "aller_retour", checked: tripType === 'aller_retour', onChange: () => setTripType('aller_retour') }), _jsx("span", { className: "ml-2", children: "Aller-retour" })] })] })] }), _jsxs("div", { className: "mt-6", children: [_jsxs("p", { className: "text-sm text-gray-600 mb-1", children: [unitPrice.toLocaleString(), " FCFA x ", tripType === 'aller_retour' ? `${seatsGo} + ${seatsReturn}` : seatsGo, " place(s)"] }), _jsxs("p", { className: "text-lg font-bold mb-2", children: ["Total : ", totalCost.toLocaleString(), " FCFA"] }), _jsx("button", { type: "submit", disabled: isPaying, className: "w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700", children: isPaying ? 'Traitement en cours...' : 'Réserver maintenant' })] }), _jsx("div", { className: "mt-4 text-sm text-gray-500", children: _jsx("p", { className: "italic", children: "Moyen de paiement mobile money obligatoire (int\u00E9gration de SinetPay \u00E0 venir)" }) })] })] }));
};
export default FormulaireReservationClient;
