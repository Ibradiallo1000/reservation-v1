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
// src/pages/AgenceTrajetsPage.tsx
import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, deleteDoc, doc, updateDoc, } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { generateWeeklyTrips } from '../services/generateWeeklyTrips';
import { generateDailyTripsForWeeklyTrip } from '../services/generateDailyTripsForWeeklyTrip';
import { useAuth } from '@/contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import VilleInput from '../components/form/VilleInput';
import { ajouterVillesDepuisTrajet } from '../utils/updateVilles';
const joursDeLaSemaine = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const AgenceTrajetsPage = () => {
    const { user } = useAuth();
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
        fetchTrajets();
    }, [user, page, search, filtreJour]);
    const fetchTrajets = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId))
            return;
        const q = query(collection(db, 'weeklyTrips'), where('agencyId', '==', user.agencyId));
        const snap = yield getDocs(q);
        const data = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        const sorted = data.sort((a, b) => { var _a, _b; return (((_a = b.createdAt) === null || _a === void 0 ? void 0 : _a.seconds) || 0) - (((_b = a.createdAt) === null || _b === void 0 ? void 0 : _b.seconds) || 0); });
        const filtered = sorted.filter(t => {
            var _a, _b;
            return (t.departure.toLowerCase().includes(search.toLowerCase()) ||
                t.arrival.toLowerCase().includes(search.toLowerCase())) &&
                (filtreJour === '' || (((_b = (_a = t.horaires) === null || _a === void 0 ? void 0 : _a[filtreJour]) === null || _b === void 0 ? void 0 : _b.length) > 0));
        });
        const paginated = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);
        setTrajets(paginated);
    });
    const supprimerTrajet = (id) => __awaiter(void 0, void 0, void 0, function* () {
        if (!confirm('Voulez-vous vraiment supprimer ce trajet ?'))
            return;
        setLoading(true);
        try {
            yield deleteDoc(doc(db, 'weeklyTrips', id));
            const snap = yield getDocs(query(collection(db, 'dailyTrips'), where('weeklyTripId', '==', id)));
            for (const d of snap.docs)
                yield deleteDoc(doc(db, 'dailyTrips', d.id));
            fetchTrajets();
            setMessage('🗑️ Trajet supprimé avec succès.');
        }
        catch (err) {
            console.error(err);
            setMessage("❌ Erreur lors de la suppression du trajet.");
        }
        finally {
            setLoading(false);
        }
    });
    const handleHoraireChange = (day, index, value) => {
        setHoraires(prev => {
            const copy = Object.assign({}, prev);
            if (!copy[day])
                copy[day] = [];
            copy[day][index] = value;
            return copy;
        });
    };
    const addHoraire = (day) => {
        setHoraires(prev => (Object.assign(Object.assign({}, prev), { [day]: [...(prev[day] || []), ''] })));
    };
    const removeHoraire = (day, index) => {
        setHoraires(prev => {
            const copy = Object.assign({}, prev);
            copy[day].splice(index, 1);
            return copy;
        });
    };
    const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    const resetForm = () => {
        setDeparture('');
        setArrival('');
        setPrice('');
        setPlaces('');
        setHoraires({});
        setModifierId(null);
    };
    const exporterPDF = () => {
        const doc = new jsPDF();
        doc.text('Liste des trajets', 14, 14);
        autoTable(doc, {
            head: [['Départ', 'Arrivée', 'Prix', 'Places']],
            body: trajets.map(t => [t.departure, t.arrival, `${t.price} FCFA`, t.places || '']),
        });
        doc.save('trajets_agence.pdf');
    };
    const handleSubmit = () => __awaiter(void 0, void 0, void 0, function* () {
        if (!(user === null || user === void 0 ? void 0 : user.agencyId) || !(user === null || user === void 0 ? void 0 : user.companyId))
            return setMessage('Agence ou compagnie non reconnue.');
        setLoading(true);
        setMessage('');
        const horairesFiltres = {};
        for (const jour in horaires) {
            const heuresValides = horaires[jour].filter(h => h && h.trim() !== '');
            if (heuresValides.length > 0)
                horairesFiltres[jour] = heuresValides;
        }
        const dep = capitalize(departure.trim());
        const arr = capitalize(arrival.trim());
        if (!dep || !arr || !price.trim() || !places.trim() || Object.keys(horairesFiltres).length === 0) {
            setLoading(false);
            return setMessage('Merci de remplir tous les champs y compris le nombre de places.');
        }
        try {
            if (modifierId) {
                const tripRef = doc(db, 'weeklyTrips', modifierId);
                yield updateDoc(tripRef, {
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
                yield generateWeeklyTrips(user.companyId, // ✅ Corrigé ici
                dep, arr, parseInt(price), horairesFiltres, parseInt(places), user.agencyId);
                yield ajouterVillesDepuisTrajet(dep, arr);
                const snapshot = yield getDocs(query(collection(db, 'weeklyTrips'), where('agencyId', '==', user.agencyId)));
                const latestTrip = snapshot.docs
                    .filter(doc => doc.data().departure === dep && doc.data().arrival === arr)
                    .sort((a, b) => { var _a, _b; return (((_a = b.data().createdAt) === null || _a === void 0 ? void 0 : _a.seconds) || 0) - (((_b = a.data().createdAt) === null || _b === void 0 ? void 0 : _b.seconds) || 0); })[0];
                if (latestTrip)
                    yield generateDailyTripsForWeeklyTrip(latestTrip.id);
                setMessage('✅ Trajet ajouté avec succès !');
            }
            resetForm();
            fetchTrajets();
        }
        catch (error) {
            console.error(error);
            setMessage("❌ Erreur lors de l'enregistrement du trajet.");
        }
        finally {
            setLoading(false);
        }
    });
    const toggleActif = (id, current) => __awaiter(void 0, void 0, void 0, function* () {
        setLoading(true);
        try {
            yield updateDoc(doc(db, 'weeklyTrips', id), { active: !current });
            const snap = yield getDocs(query(collection(db, 'dailyTrips'), where('weeklyTripId', '==', id)));
            for (const d of snap.docs) {
                yield updateDoc(doc(db, 'dailyTrips', d.id), { active: !current });
            }
            fetchTrajets();
            setMessage(current ? '🚫 Trajet désactivé.' : '✅ Trajet activé.');
        }
        catch (error) {
            console.error(error);
            setMessage("❌ Erreur lors du changement d'état.");
        }
        finally {
            setLoading(false);
        }
    });
    const modifierTrajet = (trip) => {
        setDeparture(trip.departure);
        setArrival(trip.arrival);
        setPrice(trip.price.toString());
        setPlaces((trip.places || '').toString());
        setHoraires(trip.horaires);
        setModifierId(trip.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    return (_jsxs("div", { className: "p-4 grid md:grid-cols-2 gap-6", children: [_jsxs("div", { children: [_jsx("h2", { className: "text-xl font-bold mb-4", children: modifierId ? 'Modifier le trajet' : 'Ajouter un trajet' }), _jsxs("div", { className: "mb-4 flex flex-col gap-2", children: [_jsx(VilleInput, { label: "Ville de d\u00E9part", value: departure, onChange: setDeparture }), _jsx(VilleInput, { label: "Ville d'arriv\u00E9e", value: arrival, onChange: setArrival }), _jsx("input", { type: "number", placeholder: "Prix", value: price, onChange: e => setPrice(e.target.value), className: "border p-2" }), _jsx("input", { type: "number", placeholder: "Nombre de places", value: places, onChange: e => setPlaces(e.target.value), className: "border p-2" })] }), joursDeLaSemaine.map(jour => (_jsxs("div", { className: "mb-2", children: [_jsxs("p", { className: "font-semibold", children: [jour, " :"] }), (horaires[jour] || []).map((h, i) => (_jsxs("div", { className: "flex gap-2 my-1", children: [_jsx("input", { type: "time", value: h, onChange: e => handleHoraireChange(jour, i, e.target.value), className: "border p-1" }), _jsx("button", { type: "button", onClick: () => removeHoraire(jour, i), className: "text-red-600", children: "Supprimer" })] }, i))), _jsx("button", { type: "button", onClick: () => addHoraire(jour), className: "bg-blue-500 text-white px-2 py-1 rounded mt-1", children: "+ Ajouter une heure" })] }, jour))), _jsx("button", { onClick: handleSubmit, disabled: loading, className: "mt-4 bg-green-600 text-white px-4 py-2 rounded", children: loading ? 'Traitement en cours...' : modifierId ? 'Mettre à jour' : 'Ajouter le trajet' }), message && _jsx("p", { className: "mt-2 text-sm text-blue-700 font-semibold", children: message })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex justify-between items-center mb-4", children: [_jsx("h2", { className: "text-xl font-bold", children: "Liste des trajets" }), _jsx("button", { onClick: exporterPDF, className: "bg-purple-600 text-white px-3 py-1 rounded", children: "\uD83D\uDCC4 Exporter en PDF" })] }), _jsx("input", { type: "text", placeholder: "Rechercher...", value: search, onChange: e => { setSearch(e.target.value); setPage(1); }, className: "border mb-4 p-2 w-full" }), _jsxs("div", { className: "flex flex-wrap gap-2 mb-4", children: [_jsx("button", { onClick: () => setFiltreJour(''), className: `px-3 py-1 rounded ${filtreJour === '' ? 'bg-blue-700 text-white' : 'bg-gray-200'}`, children: "Tous" }), joursDeLaSemaine.map(jour => (_jsx("button", { onClick: () => setFiltreJour(jour), className: `px-3 py-1 rounded ${filtreJour === jour ? 'bg-blue-700 text-white' : 'bg-gray-200'}`, children: jour }, jour)))] }), trajets.map(t => (_jsxs("div", { className: "border rounded p-3 mb-2 shadow", children: [_jsxs("div", { className: `cursor-pointer font-semibold ${t.active ? 'text-green-700' : 'text-red-500'}`, onClick: () => setExpandedId(expandedId === t.id ? null : t.id), children: [t.departure, " \u2192 ", t.arrival, " (", t.active ? 'Actif' : 'Inactif', ")"] }), expandedId === t.id && (_jsxs("div", { className: "mt-2 text-sm", children: [_jsxs("p", { children: ["Prix : ", t.price, " FCFA"] }), _jsxs("p", { children: ["Places : ", t.places || 'NC'] }), joursDeLaSemaine.map(jour => {
                                        var _a;
                                        const heures = (_a = t.horaires) === null || _a === void 0 ? void 0 : _a[jour];
                                        if (!heures || heures.length === 0)
                                            return null;
                                        const heuresTriees = [...heures].sort();
                                        return _jsxs("p", { children: [_jsxs("strong", { children: [jour, " :"] }), " ", heuresTriees.join(', ')] }, jour);
                                    }), _jsxs("div", { className: "mt-2 flex gap-2 flex-wrap", children: [_jsx("button", { onClick: () => supprimerTrajet(t.id), disabled: loading, className: "bg-red-600 text-white px-2 py-1 rounded", children: "Supprimer" }), _jsx("button", { onClick: () => modifierTrajet(t), disabled: loading, className: "bg-yellow-500 text-white px-2 py-1 rounded", children: "Modifier" }), _jsx("button", { onClick: () => toggleActif(t.id, t.active), disabled: loading, className: `px-2 py-1 rounded text-white ${t.active ? 'bg-gray-600' : 'bg-green-600'}`, children: t.active ? 'Désactiver' : 'Activer' })] })] }))] }, t.id))), !loading && trajets.length === 0 && (_jsx("div", { className: "text-gray-600 text-sm text-center mt-4", children: "Aucun trajet enregistr\u00E9 pour cette agence." })), _jsxs("div", { className: "flex justify-between mt-4", children: [_jsx("button", { onClick: () => setPage(p => Math.max(1, p - 1)), disabled: page === 1, className: "bg-gray-300 px-3 py-1 rounded", children: "Pr\u00E9c\u00E9dent" }), _jsx("button", { onClick: () => setPage(p => p + 1), className: "bg-gray-300 px-3 py-1 rounded", children: "Suivant" })] })] })] }));
};
export default AgenceTrajetsPage;
