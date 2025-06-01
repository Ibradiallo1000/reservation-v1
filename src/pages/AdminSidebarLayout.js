import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useLocation, Outlet, useNavigate } from 'react-router-dom';
const AdminSidebarLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
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
    return (_jsxs("div", { className: "flex h-screen", children: [_jsx("aside", { className: "w-64 bg-white border-r shadow", children: _jsx("nav", { className: "p-4 space-y-2", children: links.map((link, idx) => (_jsx("div", { className: `cursor-pointer px-3 py-2 rounded transition ${location.pathname === link.path
                            ? 'bg-blue-100 text-blue-700 font-semibold'
                            : 'hover:bg-gray-100'}`, onClick: () => navigate(link.path), children: link.label }, idx))) }) }), _jsxs("main", { className: "flex-1 bg-gray-50 p-6 overflow-auto", children: [_jsx(Outlet, {}), " "] })] }));
};
export default AdminSidebarLayout;
