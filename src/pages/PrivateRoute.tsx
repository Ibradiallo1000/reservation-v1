import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { Role } from '../roles-permissions';

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles: Role[];
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="p-6 text-gray-600">Chargement en cours...</div>;
  }

  // Utilisateur non connecté
  if (!user) {
    console.warn('🔒 Aucun utilisateur connecté. Redirection vers /login');
    return <Navigate to="/login" replace />;
  }

  // Rôle non autorisé
  if (!allowedRoles.includes(user.role as Role)) {
    console.warn(
      `⛔ Accès refusé : rôle actuel = "${user.role}" | rôles requis = ${JSON.stringify(allowedRoles)}`
    );

    // OPTION 1 : Rediriger vers la Home
    return <Navigate to="/" replace />;

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
  return <>{children}</>;
};

export default PrivateRoute;
