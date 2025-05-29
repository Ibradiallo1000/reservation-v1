import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
const PrivateRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    if (loading) {
        return _jsx("div", { className: "p-6 text-gray-600", children: "Chargement..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/login" });
    }
    if (!allowedRoles.includes(user.role)) {
        console.warn(`⛔ Accès refusé – rôle: ${user.role} | autorisés: ${JSON.stringify(allowedRoles)}`);
        return (_jsx("div", { className: "p-6 text-red-600", children: "\u26D4 Acc\u00E8s refus\u00E9 \u00E0 ce tableau de bord" }));
    }
    return _jsx(_Fragment, { children: children });
};
export default PrivateRoute;
