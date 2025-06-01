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
// ✅ MesReservationsPage.tsx – amélioré pour affichage client
import { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
const MesReservationsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [reservations, setReservations] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const fetchReservations = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!user)
                return;
            setLoading(true);
            const reservationsRef = collection(db, 'reservations');
            const reservationsQuery = query(reservationsRef, where('clientId', '==', user.uid));
            const reservationsSnapshot = yield getDocs(reservationsQuery);
            const data = reservationsSnapshot.docs.map((doc) => (Object.assign({ id: doc.id }, doc.data())));
            setReservations(data);
            setLoading(false);
        });
        fetchReservations();
    }, [user]);
    return (_jsxs("div", { className: "p-4", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "Mes R\u00E9servations" }), loading ? (_jsx("p", { children: "Chargement..." })) : (_jsx("div", { className: "overflow-auto rounded-lg shadow", children: _jsxs("table", { className: "min-w-full bg-white text-sm", children: [_jsx("thead", { className: "bg-gray-100 text-left", children: _jsxs("tr", { children: [_jsx("th", { className: "p-3", children: "Trajet" }), _jsx("th", { className: "p-3", children: "Date & Heure" }), _jsx("th", { className: "p-3", children: "Places" }), _jsx("th", { className: "p-3", children: "Montant" }), _jsx("th", { className: "p-3", children: "Statut" }), _jsx("th", { className: "p-3", children: "Action" })] }) }), _jsxs("tbody", { children: [reservations.map((r) => {
                                    var _a;
                                    return (_jsxs("tr", { className: "border-t hover:bg-gray-50", children: [_jsxs("td", { className: "p-3 font-semibold", children: [r.depart, " \u2192 ", r.arrivee] }), _jsxs("td", { className: "p-3 text-blue-700", children: [dayjs(r.date).format('DD/MM/YYYY'), " \u00E0 ", r.heure] }), _jsx("td", { className: "p-3", children: r.nombre_places }), _jsxs("td", { className: "p-3", children: [(_a = r.montant_total) === null || _a === void 0 ? void 0 : _a.toLocaleString(), " FCFA"] }), _jsx("td", { className: "p-3", children: _jsx("span", { className: `px-2 py-1 rounded-full text-white text-xs ${r.statut === 'payée' ? 'bg-green-600' :
                                                        r.statut === 'en attente' ? 'bg-yellow-500' :
                                                            'bg-red-600'}
                    `, children: r.statut }) }), _jsxs("td", { className: "p-3 flex gap-2", children: [_jsx("button", { onClick: () => navigate(`/reservation/${r.id}`), className: "text-blue-600 hover:underline text-sm", children: "Voir" }), dayjs().isBefore(dayjs(`${r.date}T${r.heure}`)) && (_jsx("button", { onClick: () => navigate(`/modifier-reservation/${r.id}`), className: "text-orange-600 hover:underline text-sm", children: "Modifier" }))] })] }, r.id));
                                }), reservations.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "p-4 text-center text-gray-500", children: "Aucune r\u00E9servation trouv\u00E9e" }) }))] })] }) }))] }));
};
export default MesReservationsPage;
