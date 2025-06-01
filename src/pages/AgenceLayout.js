import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { Link, Outlet, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, Ticket, MapPinned, Mail, Wallet, Coins, Receipt, Users, ClipboardList, ChevronDown, ChevronUp, Settings, LogOut } from 'lucide-react';
const cn = (...classes) => classes.filter(Boolean).join(' ');
const AgenceLayout = () => {
    const { user, logout, hasPermission } = useAuth();
    const location = useLocation();
    const [openMenus, setOpenMenus] = useState({});
    const menuItems = useMemo(() => [
        {
            label: 'Dashboard',
            path: '/agence/dashboard',
            icon: _jsx(LayoutDashboard, { className: "w-5 h-5" }),
            permission: 'view_dashboard'
        },
        {
            label: 'Guichet',
            path: '/agence/guichet',
            icon: _jsx(Ticket, { className: "w-5 h-5" }),
            permission: 'access_ticketing'
        },
        {
            label: 'Trajets',
            path: '/agence/trajets',
            icon: _jsx(MapPinned, { className: "w-5 h-5" }),
            permission: 'manage_routes'
        },
        {
            label: 'Courriers',
            icon: _jsx(Mail, { className: "w-5 h-5" }),
            permission: 'manage_mail',
            submenu: [
                { label: 'Envoi', path: '/agence/courriers/envoi', permission: 'mail_send' },
                { label: 'Réception', path: '/agence/courriers/reception', permission: 'mail_receive' },
            ]
        },
        {
            label: 'Finances',
            path: '/agence/finances',
            icon: _jsx(Wallet, { className: "w-5 h-5" }),
            permission: 'view_finances'
        },
        {
            label: 'Recettes',
            path: '/agence/recettes',
            icon: _jsx(Coins, { className: "w-5 h-5" }),
            permission: 'manage_income'
        },
        {
            label: 'Dépenses',
            path: '/agence/depenses',
            icon: _jsx(Receipt, { className: "w-5 h-5" }),
            permission: 'manage_expenses'
        },
        {
            label: 'Personnel',
            path: '/agence/personnel',
            icon: _jsx(Users, { className: "w-5 h-5" }),
            permission: 'manage_staff'
        },
        {
            label: 'Réservations',
            path: '/agence/reservations',
            icon: _jsx(ClipboardList, { className: "w-5 h-5" }),
            permission: 'manage_bookings'
        },
    ], []);
    const toggleSubMenu = (label) => {
        setOpenMenus(prev => (Object.assign(Object.assign({}, prev), { [label]: !prev[label] })));
    };
    const isActive = (path, submenu) => {
        if (path)
            return matchPath(path, location.pathname);
        if (submenu)
            return submenu.some(item => matchPath(item.path, location.pathname));
        return false;
    };
    return (_jsxs("div", { className: "flex min-h-screen bg-gray-50", children: [_jsxs("aside", { className: "w-64 bg-gray-800 text-white flex flex-col fixed h-full", children: [_jsxs("div", { className: "p-4 border-b border-gray-700", children: [_jsx("h1", { className: "text-xl font-bold", children: (user === null || user === void 0 ? void 0 : user.agencyName) || 'Tableau de bord' }), _jsxs("p", { className: "text-xs text-gray-400 mt-1", children: ["Version ", import.meta.env.VITE_APP_VERSION || '1.0.0'] })] }), _jsx("nav", { className: "flex-1 overflow-y-auto py-4", children: _jsx("div", { className: "space-y-1 px-2", children: menuItems.map((item) => {
                                const canAccess = !item.permission || hasPermission(item.permission);
                                if (!canAccess)
                                    return null;
                                return item.submenu ? (_jsxs("div", { children: [_jsxs("button", { onClick: () => toggleSubMenu(item.label), className: cn("flex items-center w-full px-4 py-3 text-sm font-medium rounded-md transition-colors", "hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-600", isActive(undefined, item.submenu) ? "bg-gray-700" : ""), children: [_jsx("span", { className: "mr-3", children: item.icon }), item.label, openMenus[item.label] ? (_jsx(ChevronUp, { className: "ml-auto h-4 w-4" })) : (_jsx(ChevronDown, { className: "ml-auto h-4 w-4" }))] }), openMenus[item.label] && (_jsx("div", { className: "mt-1 space-y-1 ml-12", children: item.submenu.map((subItem) => {
                                                const canAccessSub = !subItem.permission || hasPermission(subItem.permission);
                                                if (!canAccessSub)
                                                    return null;
                                                return (_jsx(Link, { to: subItem.path, className: cn("block px-3 py-2 text-sm rounded-md transition-colors", "hover:bg-gray-700", matchPath(subItem.path, location.pathname) ? "bg-gray-700 font-medium" : "text-gray-300"), children: subItem.label }, subItem.path));
                                            }) }))] }, item.label)) : (_jsxs(Link, { to: item.path || '#', className: cn("flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors", "hover:bg-gray-700", isActive(item.path) ? "bg-gray-700" : ""), children: [_jsx("span", { className: "mr-3", children: item.icon }), item.label] }, item.path || item.label));
                            }) }) }), _jsx("div", { className: "p-4 border-t border-gray-700", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-medium", children: (user === null || user === void 0 ? void 0 : user.displayName) || (user === null || user === void 0 ? void 0 : user.email) }), _jsx("p", { className: "text-xs text-gray-400 capitalize", children: user === null || user === void 0 ? void 0 : user.role })] }), _jsxs("div", { className: "flex space-x-2", children: [_jsx(Link, { to: "/agence/parametres", className: "p-1 rounded-md hover:bg-gray-700 text-gray-300 hover:text-white", title: "Param\u00E8tres", children: _jsx(Settings, { className: "h-5 w-5" }) }), _jsx("button", { onClick: logout, className: "p-1 rounded-md hover:bg-gray-700 text-gray-300 hover:text-white", title: "D\u00E9connexion", children: _jsx(LogOut, { className: "h-5 w-5" }) })] })] }) })] }), _jsx("main", { className: "flex-1 ml-64 p-6 overflow-auto", children: _jsx("div", { className: "max-w-7xl mx-auto", children: _jsx(Outlet, {}) }) })] }));
};
export default AgenceLayout;
