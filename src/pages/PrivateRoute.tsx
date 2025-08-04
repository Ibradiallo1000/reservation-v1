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

  // 🔄 Attendre que Firebase ait validé l'état de session
  if (loading) {
    return (
      <div className="p-6 text-gray-600 text-center">
        Vérification de l'authentification...
      </div>
    );
  }

  // ❌ Aucun utilisateur une fois que loading est terminé
  if (!user) {
    console.warn('🔒 Aucun utilisateur connecté. Redirection vers /login');
    return <Navigate to="/login" replace />;
  }

  // ❌ Rôle non autorisé
  if (!allowedRoles.includes(user.role as Role)) {
    console.warn(
      `⛔ Accès refusé : rôle actuel = "${user.role}" | rôles requis = ${JSON.stringify(allowedRoles)}`
    );
    return <Navigate to="/" replace />;
  }

  // ✅ Accès autorisé
  console.log(`✅ Accès autorisé pour ${user.email} – rôle : ${user.role}`);
  return <>{children}</>;
};

export default PrivateRoute;
