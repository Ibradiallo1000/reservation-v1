// src/pages/PrivateRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export type Role =
  | 'admin_platforme'
  | 'admin_compagnie'
  | 'compagnie'
  | 'chefAgence'
  | 'guichetier'
  | 'superviseur'
  | 'agentCourrier'
  | 'comptable'
  | 'embarquement'
  | 'user'
  | 'financier';

interface PrivateRouteProps {
  children: React.ReactNode;
  // readonly → compatible avec [...routePermissions.xxx] typés "as const"
  allowedRoles: readonly Role[];
}

/** Normalise les variantes possibles venant de Firestore / Auth */
const normalizeRole = (r?: unknown): Role => {
  const raw = String(r ?? 'user').trim();
  const lc = raw.toLowerCase();

  if (lc === 'chef_agence' || lc === 'chefagence') return 'chefAgence';
  if (lc === 'admin plateforme' || lc === 'admin_platforme') return 'admin_platforme';
  if (lc === 'admin compagnie' || lc === 'admin_compagnie') return 'admin_compagnie';
  if (lc === 'agent_courrier' || lc === 'agentcourrier') return 'agentCourrier';
  if (lc === 'guichetier') return 'guichetier';
  if (lc === 'superviseur') return 'superviseur';
  if (lc === 'comptable') return 'comptable';
  if (lc === 'embarquement') return 'embarquement';
  if (lc === 'compagnie') return 'compagnie';
  return 'user';
};

const defaultLandingByRole: Record<Role, string> = {
  admin_platforme: '/admin/dashboard',
  admin_compagnie: '/compagnie/dashboard',
  compagnie: '/compagnie/dashboard',
  chefAgence: '/agence/dashboard',
  superviseur: '/agence/dashboard',
  agentCourrier: '/agence/dashboard',
  guichetier: '/agence/guichet',
  comptable: '/agence/comptabilite',
  embarquement: '/agence/embarquement',
  user: '/',
  financier: ''
};

const asArray = (v: unknown) => (Array.isArray(v) ? v : [v].filter(Boolean));

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // ⏳ Attendre Firebase
  if (loading) {
    return <div className="p-6 text-gray-600 text-center">Vérification de l'authentification…</div>;
  }

  // ❌ Non connecté
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Rôles utilisateur (supporte string ou string[])
  const rolesRaw = (user as any).role;
  const userRoles: Role[] = asArray(rolesRaw).map(normalizeRole);

  // ✅ Autorisation si au moins un rôle matche
  const isAllowed = userRoles.some((r) => allowedRoles.includes(r));
  if (!isAllowed) {
    // Redirige vers la première page d’atterrissage correspondant à l’un de ses rôles
    const firstLanding =
      userRoles
        .map((r) => defaultLandingByRole[r])
        .find(Boolean) || '/';
    return <Navigate to={firstLanding} replace />;
  }

  // ✅ Après connexion, si on est sur "/", rediriger vers la page du premier rôle
  if (location.pathname === '/') {
    const firstLanding =
      userRoles
        .map((r) => defaultLandingByRole[r])
        .find(Boolean) || '/';
    if (firstLanding !== '/') return <Navigate to={firstLanding} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
