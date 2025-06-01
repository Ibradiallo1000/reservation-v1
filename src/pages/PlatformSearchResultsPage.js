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
// ✅ PlatformSearchResultsPage.tsx – version finale avec affichage propre du trajet et du prix
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const PlatformSearchResultsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const criteres = location.state;
    const [groupedTrajets, setGroupedTrajets] = useState({});
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    useEffect(() => {
        const fetchTrajets = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(criteres === null || criteres === void 0 ? void 0 : criteres.departure) || !(criteres === null || criteres === void 0 ? void 0 : criteres.arrival)) {
                navigate('/');
                return;
            }
            const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
            const dep = capitalize(criteres.departure);
            const arr = capitalize(criteres.arrival);
            setLoading(true);
            try {
                const trajetsSnapshot = yield getDocs(query(collection(db, 'dailyTrips')));
                const now = new Date();
                const trajets = [];
                for (const docSnap of trajetsSnapshot.docs) {
                    const data = docSnap.data();
                    if (data.departure === dep &&
                        data.arrival === arr &&
                        !!data.date &&
                        !!data.time &&
                        !!data.price &&
                        !!data.companyId &&
                        new Date(`${data.date}T${data.time}`) > now) {
                        const companyRef = doc(db, 'companies', data.companyId);
                        const companySnap = yield getDoc(companyRef);
                        trajets.push(Object.assign(Object.assign({ id: docSnap.id }, data), { compagnieNom: companySnap.exists() ? companySnap.data().nom : 'Inconnue', logoUrl: companySnap.exists() ? companySnap.data().logoUrl : '' }));
                    }
                }
                const grouped = {};
                for (const t of trajets) {
                    const key = `${t.companyId}|${t.compagnieNom}|${t.logoUrl || ''}`;
                    if (!grouped[key])
                        grouped[key] = [];
                    grouped[key].push(t);
                }
                setGroupedTrajets(grouped);
            }
            catch (err) {
                console.error('Erreur Firestore :', err);
            }
            finally {
                setLoading(false);
            }
        });
        fetchTrajets();
    }, [criteres, navigate]);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h2", { className: "text-xl font-bold mb-6", children: "Trajets disponibles \u2013 Plateforme" }), _jsx("input", { type: "text", placeholder: "Filtrer par compagnie...", value: filter, onChange: (e) => setFilter(e.target.value), className: "mb-6 border border-gray-300 rounded px-3 py-2 w-full max-w-md" }), loading ? (_jsx("p", { children: "Chargement..." })) : Object.keys(groupedTrajets).length === 0 ? (_jsx("p", { className: "text-red-600", children: "Aucun trajet trouv\u00E9." })) : (Object.entries(groupedTrajets)
                .filter(([key]) => key.toLowerCase().includes(filter.toLowerCase()))
                .map(([key, trajets]) => {
                const [companyId, compagnieNom, logoUrl] = key.split('|');
                const slug = compagnieNom.toLowerCase().replace(/\s+/g, '-').trim();
                const prixMin = Math.min(...trajets.map(t => t.price));
                return (_jsxs("div", { className: "border rounded-xl p-4 mb-6 shadow-md bg-white flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-4", children: [logoUrl && _jsx("img", { src: logoUrl, alt: "Logo", className: "w-12 h-12 rounded-full object-cover" }), _jsxs("div", { children: [_jsx("h3", { className: "text-lg font-semibold text-gray-800", children: compagnieNom }), _jsxs("p", { className: "text-sm text-gray-500", children: [criteres === null || criteres === void 0 ? void 0 : criteres.departure, " \u2192 ", criteres === null || criteres === void 0 ? void 0 : criteres.arrival] }), _jsxs("p", { className: "text-sm text-green-700 font-semibold", children: ["\u00C0 partir de ", prixMin.toLocaleString(), " FCFA"] })] })] }), _jsx("button", { onClick: () => navigate(`/compagnie/${slug}/resultats?departure=${criteres === null || criteres === void 0 ? void 0 : criteres.departure}&arrival=${criteres === null || criteres === void 0 ? void 0 : criteres.arrival}`), className: "bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm", children: "R\u00E9server" })] }, key));
            }))] }));
};
export default PlatformSearchResultsPage;
