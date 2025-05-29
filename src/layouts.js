import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
const AdminSidebarLayout = ({ children }) => {
    return (_jsxs("div", { className: "flex min-h-screen", children: [_jsxs("aside", { className: "w-64 bg-white shadow-lg p-4", children: [_jsx("h2", { className: "text-lg font-bold mb-6", children: "Admin Panel" }), _jsxs("ul", { className: "space-y-3", children: [_jsx("li", { children: _jsx(Link, { to: "/admin/dashboard", className: "text-blue-600", children: "Tableau de bord" }) }), _jsx("li", { children: _jsx(Link, { to: "/admin/compagnies", className: "text-blue-600", children: "Compagnies" }) }), _jsx("li", { children: _jsx(Link, { to: "/admin/ajouter-compagnie", className: "text-blue-600", children: "Ajouter Compagnie" }) }), _jsx("li", { children: _jsx(Link, { to: "/admin/ajouter-trajet", className: "text-blue-600", children: "Ajouter Trajet" }) })] })] }), _jsx("main", { className: "flex-1 bg-gray-100 p-6", children: children })] }));
};
export default AdminSidebarLayout;
