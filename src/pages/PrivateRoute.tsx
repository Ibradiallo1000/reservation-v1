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
    return <div className="p-6 text-gray-600">Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!allowedRoles.includes(user.role as Role)) {
    console.warn(
      `⛔ Accès refusé – rôle: ${user.role} | autorisés: ${JSON.stringify(allowedRoles)}`
    );
    return (
      <div className="p-6 text-red-600">
        ⛔ Accès refusé à ce tableau de bord
      </div>
    );
  }

  return <>{children}</>;
};

export default PrivateRoute;
