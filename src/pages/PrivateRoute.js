import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
const PrivateRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    if (loading) {
        return _jsx("div", { className: "p-6 text-gray-600", children: "Chargement en cours..." });
    }
    // Utilisateur non connecté
    if (!user) {
        console.warn('🔒 Aucun utilisateur connecté. Redirection vers /login');
        return _jsx(Navigate, { to: "/login", replace: true });
    }
    // Rôle non autorisé
    if (!allowedRoles.includes(user.role)) {
        console.warn(`⛔ Accès refusé : rôle actuel = "${user.role}" | rôles requis = ${JSON.stringify(allowedRoles)}`);
        // OPTION 1 : Rediriger vers la Home
        return _jsx(Navigate, { to: "/", replace: true });
        // OPTION 2 : Afficher un message explicite (décommente ceci si tu préfères)
        // return (
        //   <div className="p-6 text-red-600">
        //     ⛔ Accès refusé à cette page.<br />
        //     Votre rôle : <strong>{user.role}</strong><br />
        //     Accès requis : <strong>{allowedRoles.join(', ')}</strong>
        //   </div>
        // );
    }
    // ✅ Accès autorisé
    console.log(`✅ Accès autorisé pour ${user.email} – rôle : ${user.role}`);
    return _jsx(_Fragment, { children: children });
};
export default PrivateRoute;
