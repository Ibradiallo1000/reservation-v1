import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation } from 'react-router-dom';
const AdminSidebarLayout = ({ children }) => {
    const location = useLocation();
    const links = [
        { label: 'Tableau de bord', path: '/admin/dashboard' },
        { label: 'Compagnies', path: '/admin/compagnies' },
        { label: 'Réservations', path: '/admin/reservations' },
        { label: 'Finances', path: '/admin/finances' },
        { label: 'Statistiques', path: '/admin/statistiques' },
        { label: 'Historique des ventes', path: '/admin/ventes' },
        { label: 'Dépenses journalières', path: '/admin/depenses' },
        { label: 'Messagerie', path: '/admin/messagerie' },
        { label: 'Paramètres', path: '/admin/parametres' },
        { label: 'Ajouter un personnel', path: '/admin/ajouter-personnel' },
        { label: 'Liste du personnel', path: '/admin/liste-personnel' },
    ];
    return (_jsxs("div", { className: "flex h-screen", children: [_jsx("aside", { className: "w-64 bg-white border-r", children: _jsx("nav", { className: "p-4", children: links.map((link, idx) => (_jsx("div", { className: `mb-2 ${location.pathname === link.path ? 'font-semibold text-blue-600' : ''}`, children: _jsx("a", { href: link.path, children: link.label }) }, idx))) }) }), _jsx("main", { className: "flex-1 bg-gray-100 p-6 overflow-auto", children: children })] }));
};
export default AdminSidebarLayout;
