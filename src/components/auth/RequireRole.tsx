// src/components/auth/RequireRole.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUserRole } from '@/hooks/useUserRole';
import { permissionsByRole } from '@/roles-permissions';

type AnyRole = keyof typeof permissionsByRole | string;

interface RequireRoleProps {
  anyOf: AnyRole[];         // rôles acceptés
  redirectTo?: string;      // redirection si non autorisé
  children: React.ReactNode;
  fallback?: React.ReactNode; // UI pendant le chargement
}

export default function RequireRole({
  anyOf,
  redirectTo = '/login',
  children,
  fallback
}: RequireRoleProps) {
  const { user, role, loading } = useUserRole();
  const location = useLocation();

  if (loading) {
    return (
      fallback ?? (
        <div className="min-h-[50vh] flex items-center justify-center text-slate-500">
          Chargement des autorisations…
        </div>
      )
    );
  }

  if (!user) {
    // Non connecté → login
    return <Navigate to={redirectTo} replace state={{ from: location }} />;
  }

  // Autorisé ?
  const allowed = anyOf.includes(role);
  if (!allowed) {
    // 403 UX : page simple + bouton retour
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white border border-slate-200 rounded-2xl shadow p-8 max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-900">Accès non autorisé</h1>
          <p className="mt-2 text-slate-600">
            Ton rôle <span className="font-mono">{String(role)}</span> n’a pas accès à cette page.
          </p>
          <a href="/" className="mt-6 inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
            Retour à l’accueil
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
