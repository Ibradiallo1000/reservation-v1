// src/routes/RoleLanding.tsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export default function RoleLanding() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  switch (user.role) {
    case 'guichetier':
      return <Navigate to="/agence/guichet" replace />;
    case 'gestionnaire':
    case 'financier':
    case 'comptable':
      return <Navigate to="/compta" replace />;
    case 'chefAgence':
    case 'admin_compagnie':
      return <Navigate to="/agence/dashboard" replace />;
    default:
      return <Navigate to="/login" replace />;
  }
}
