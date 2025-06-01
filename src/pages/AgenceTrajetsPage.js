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
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { generateWeeklyTrips } from '../services/generateWeeklyTrips';
import { generateDailyTripsForWeeklyTrip } from '../services/generateDailyTripsForWeeklyTrip';
import { useAuth } from '@/contexts/AuthContext';
import VilleInput from '../components/form/VilleInput';
import { ajouterVillesDepuisTrajet } from '../utils/updateVilles';
const joursDeLaSemaine = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const AgenceTrajetsPage = () => {
    const { user } = useAuth();
    console.log('👤 Utilisateur connecté :', user);
    const [departure, setDeparture] = useState('');
    const [arrival, setArrival] = useState('');
    const [price, setPrice] = useState('');
    const [places, setPlaces] = useState('');
    const [horaires, setHoraires] = useState({});
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [trajets, setTrajets] = useState([]);
    const [expandedId, setExpandedId] = useState(null);
    const [modifierId, setModifierId] = useState(null);
    const [search, setSearch] = useState('');
    const [filtreJour, setFiltreJour] = useState('');
    const [page, setPage] = useState(1);
    const itemsPerPage = 10;
    useEffect(() => {
        console.log('🔄 useEffect déclenché');
        fetchTrajets();
    }, [user, page, search, filtreJour]);
    const fetchTrajets = () => __awaiter(void 0, void 0, void 0, function* () {
        console.log('📱 fetchTrajets en cours...');
        if (!(user === null || user === void 0 ? void 0 : user.agencyId)) {
            console.warn('⚠️ Aucune agencyId détectée');
            return;
        }
        try {
            const q = query(collection(db, 'weeklyTrips'), where('agencyId', '==', user.agencyId));
            const snap = yield getDocs(q);
            console.log('📄 Résultat Firestore snapshot :', snap);
            const data = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            console.log('📦 Données trajets :', data);
            const sorted = data.sort((a, b) => { var _a, _b; return (((_a = b.createdAt) === null || _a === void 0 ? void 0 : _a.seconds) || 0) - (((_b = a.createdAt) === null || _b === void 0 ? void 0 : _b.seconds) || 0); });
            const filtered = sorted.filter(t => {
                var _a, _b;
                return (t.departure.toLowerCase().includes(search.toLowerCase()) ||
                    t.arrival.toLowerCase().includes(search.toLowerCase())) &&
                    (filtreJour === '' || (((_b = (_a = t.horaires) === null || _a === void 0 ? void 0 : _a[filtreJour]) === null || _b === void 0 ? void 0 : _b.length) > 0));
            });
            console.log('🧮 Trajets filtrés :', filtered);
            const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
            setTrajets(paginated);
            console.log('✅ Trajets paginés :', paginated);
        }
        catch (error) {
            console.error('❌ Erreur fetchTrajets :', error);
        }
    });
    const handleSubmit = () => __awaiter(void 0, void 0, void 0, function* () {
        console.log('🚀 Envoi du formulaire');
        if (!(user === null || user === void 0 ? void 0 : user.agencyId) || !(user === null || user === void 0 ? void 0 : user.companyId))
            return setMessage('Agence ou compagnie inconnue.');
        setLoading(true);
        setMessage('');
        const horairesFiltres = {};
        for (const jour in horaires) {
            const heuresValides = horaires[jour].filter(h => h && h.trim() !== '');
            if (heuresValides.length > 0)
                horairesFiltres[jour] = heuresValides;
        }
        const dep = departure.trim();
        const arr = arrival.trim();
        if (!dep || !arr || !price.trim() || !places.trim() || Object.keys(horairesFiltres).length === 0) {
            console.warn('⚠️ Champs manquants ou horaires invalides');
            setLoading(false);
            return setMessage('Veuillez remplir tous les champs');
        }
        try {
            if (modifierId) {
                console.log('✏️ Mise à jour du trajet ID :', modifierId);
                yield updateDoc(doc(db, 'weeklyTrips', modifierId), {
                    departure: dep,
                    arrival: arr,
                    price: parseInt(price),
                    places: parseInt(places),
                    horaires: horairesFiltres,
                });
                yield generateDailyTripsForWeeklyTrip(modifierId);
                setMessage('✅ Trajet modifié avec succès.');
            }
            else {
                console.log('➕ Création d’un nouveau trajet...');
                yield generateWeeklyTrips(user.companyId, dep, arr, parseInt(price), horairesFiltres, parseInt(places), user.agencyId);
                yield ajouterVillesDepuisTrajet(dep, arr);
                setMessage('✅ Trajet ajouté avec succès.');
            }
            setDeparture('');
            setArrival('');
            setPrice('');
            setPlaces('');
            setHoraires({});
            setModifierId(null);
            fetchTrajets();
        }
        catch (error) {
            console.error('❌ Erreur ajout/modif trajet :', error);
            setMessage("Erreur lors de l'enregistrement du trajet.");
        }
        finally {
            setLoading(false);
        }
    });
    return (_jsxs("div", { className: "p-4", children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: modifierId ? 'Modifier un trajet' : 'Ajouter un trajet' }), message && _jsx("div", { className: "text-blue-600 mb-2", children: message }), _jsx(VilleInput, { label: "D\u00E9part", value: departure, onChange: setDeparture }), _jsx(VilleInput, { label: "Arriv\u00E9e", value: arrival, onChange: setArrival }), _jsx("input", { type: "number", placeholder: "Prix", value: price, onChange: e => setPrice(e.target.value), className: "border p-2 w-full my-2" }), _jsx("input", { type: "number", placeholder: "Places", value: places, onChange: e => setPlaces(e.target.value), className: "border p-2 w-full mb-4" }), joursDeLaSemaine.map(jour => (_jsxs("div", { className: "mb-2", children: [_jsx("p", { className: "font-semibold", children: jour }), (horaires[jour] || []).map((h, i) => (_jsxs("div", { className: "flex gap-2 my-1", children: [_jsx("input", { type: "time", value: h, onChange: e => {
                                    const newHoraires = Object.assign({}, horaires);
                                    newHoraires[jour][i] = e.target.value;
                                    setHoraires(newHoraires);
                                }, className: "border p-1" }), _jsx("button", { onClick: () => {
                                    const newHoraires = Object.assign({}, horaires);
                                    newHoraires[jour].splice(i, 1);
                                    setHoraires(newHoraires);
                                }, className: "text-red-500", children: "Supprimer" })] }, i))), _jsx("button", { onClick: () => setHoraires(prev => (Object.assign(Object.assign({}, prev), { [jour]: [...(prev[jour] || []), ''] }))), className: "bg-blue-500 text-white px-2 py-1 rounded", children: "+ Ajouter une heure" })] }, jour))), _jsx("button", { onClick: handleSubmit, disabled: loading, className: "bg-green-600 text-white px-4 py-2 mt-4 rounded", children: loading ? 'Traitement...' : modifierId ? 'Modifier' : 'Ajouter' }), _jsxs("pre", { className: "mt-6 text-sm bg-gray-100 p-2", children: [_jsx("strong", { children: "Debug user:" }), JSON.stringify(user, null, 2)] })] }));
};
export default AgenceTrajetsPage;
