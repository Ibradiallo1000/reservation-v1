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
// src/pages/AdminDashboard.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
const links = [
    { title: 'Créer un membre du staff', path: '/admin/ajouter-personnel', description: 'Ajouter un utilisateur interne à la plateforme' },
    { title: 'Compagnies', path: '/admin/compagnies', description: 'Voir et gérer toutes les compagnies partenaires' },
    { title: 'Réservations', path: '/admin/reservations', description: 'Voir la liste complète des réservations reçues' },
    { title: 'Agents Créés', path: '/admin/agents', description: 'Voir les agents enregistrés dans le système' },
    { title: 'Finances globales', path: '/admin/finances', description: 'Suivez les revenus, dépenses et bénéfices de la compagnie.' },
    { title: 'Statistiques', path: '/admin/statistiques', description: "Consulter les statistiques d'utilisation du système" },
    { title: 'Historique des ventes', path: '/admin/ventes', description: "Voir l'historique complet des ventes par ville ou pays" },
    { title: 'Dépenses journalières', path: '/admin/depenses', description: "Ajouter et suivre les sorties d'argent quotidiennes." },
    { title: 'Messagerie', path: '/admin/messagerie', description: 'Répondez aux clients ou communiquez avec vos agents.' },
    { title: 'Paramètres', path: '/admin/parametres', description: 'Modifiez les préférences, le mot de passe ou le logo.' },
];
const AdminDashboard = () => {
    const [stats, setStats] = useState([]);
    const [totalGlobal, setTotalGlobal] = useState({ total: 0, reservations: 0, commission: 0 });
    useEffect(() => {
        const fetchStats = () => __awaiter(void 0, void 0, void 0, function* () {
            const snapshot = yield getDocs(collection(db, 'reservations'));
            let total = 0;
            let count = 0;
            let commission = 0;
            const grouped = {};
            for (const docSnap of snapshot.docs) {
                const d = docSnap.data();
                const companyId = d.companyId || 'inconnu';
                const companySlug = d.companySlug || '—';
                const montant = d.total || 0;
                const comm = d.commission || 0;
                if (!grouped[companyId]) {
                    grouped[companyId] = {
                        companyId,
                        companySlug,
                        total: 0,
                        count: 0,
                        commission: 0,
                    };
                }
                grouped[companyId].total += montant;
                grouped[companyId].commission += comm;
                grouped[companyId].count += 1;
                total += montant;
                commission += comm;
                count++;
            }
            setStats(Object.values(grouped));
            setTotalGlobal({ total, reservations: count, commission });
        });
        fetchStats();
    }, []);
    return (_jsxs("div", { className: "p-6", children: [_jsx("h1", { className: "text-2xl font-bold mb-2", children: "Super Administrateur \u2013 Vue Globale Plateforme" }), _jsx("p", { className: "text-gray-600 mb-6", children: "G\u00E9rez toutes les compagnies, agences et utilisateurs depuis cet espace." }), _jsxs("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4 mb-8", children: [_jsxs("div", { className: "bg-white border rounded-lg p-4 shadow-sm", children: [_jsx("h2", { className: "text-sm text-gray-500", children: "Total r\u00E9servations" }), _jsx("p", { className: "text-xl font-bold text-blue-700", children: totalGlobal.reservations })] }), _jsxs("div", { className: "bg-white border rounded-lg p-4 shadow-sm", children: [_jsx("h2", { className: "text-sm text-gray-500", children: "Montant encaiss\u00E9" }), _jsxs("p", { className: "text-xl font-bold text-green-600", children: [totalGlobal.total.toLocaleString(), " FCFA"] })] }), _jsxs("div", { className: "bg-white border rounded-lg p-4 shadow-sm", children: [_jsx("h2", { className: "text-sm text-gray-500", children: "Commission g\u00E9n\u00E9r\u00E9e" }), _jsxs("p", { className: "text-xl font-bold text-orange-600", children: [totalGlobal.commission.toLocaleString(), " FCFA"] })] })] }), _jsx("h2", { className: "text-lg font-semibold mb-4", children: "D\u00E9tail par compagnie" }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8", children: stats.map((s, i) => (_jsxs("div", { className: "p-4 border rounded-lg shadow-sm bg-white", children: [_jsx("h3", { className: "text-lg font-bold text-yellow-700 mb-1", children: s.companySlug }), _jsxs("p", { className: "text-sm text-gray-700", children: ["R\u00E9servations : ", s.count] }), _jsxs("p", { className: "text-sm text-gray-700", children: ["Montant : ", s.total.toLocaleString(), " FCFA"] }), _jsxs("p", { className: "text-sm text-gray-700", children: ["Commission : ", s.commission.toLocaleString(), " FCFA"] })] }, i))) }), _jsx("h2", { className: "text-lg font-semibold mb-4", children: "Modules de gestion" }), _jsx("div", { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4", children: links.map((card, index) => (_jsxs(Link, { to: card.path, className: "p-4 border rounded-lg shadow-sm hover:shadow-md bg-white hover:bg-gray-50", children: [_jsx("h3", { className: "text-lg font-semibold text-orange-600 mb-1", children: card.title }), _jsx("p", { className: "text-sm text-gray-600", children: card.description }), "to=\"/villes\"\uD83D\uDCCD Villes"] }, index))) })] }));
};
export default AdminDashboard;
