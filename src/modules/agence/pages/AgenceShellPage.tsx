// src/pages/AgenceShellPage.tsx
import React from 'react';
import { NavLink, Outlet, useLocation, Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import {
  LayoutDashboard, ClipboardList, MapPinned, Ticket, ClipboardCheck,
  Wrench, Coins, FileBarChart2, Banknote, Users
} from 'lucide-react';

type Tab = { label: string; to: string; icon: React.ReactNode };

const AgenceShellPage: React.FC = () => {
  const { user, company, logout } = useAuth() as any;
  const theme = useCompanyTheme(company) || {
    colors: { primary: '#EA580C', secondary: '#F97316', text: '#fff', background: '#f8fafc' }
  } as any;
  const location = useLocation();

  // ---- Rôles & garde ----
  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : (user?.role ? [user.role] : []);
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);

  // Le shell est réservé aux rôles d'encadrement
  const canUseShell = has('chefAgence') || has('superviseur') || has('admin_compagnie');

  // Si l'utilisateur n'a pas le bon rôle, on redirige vers sa page dédiée
  if (!canUseShell) {
    if (has('guichetier'))   return <Navigate to="/agence/guichet" replace />;
    if (has('comptable'))    return <Navigate to="/agence/comptabilite" replace />;
    // Autres rôles ou non connecté
    return <Navigate to="/login" replace />;
  }

  // Onglets du shell (encadrement)
  const tabs: Tab[] = [
    { label: 'Dashboard',    to: '/agence/dashboard',    icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Réservations', to: '/agence/reservations', icon: <ClipboardList className="w-4 h-4" /> },
    { label: 'Embarquement', to: '/agence/embarquement', icon: <ClipboardCheck className="w-4 h-4" /> },
    { label: 'Trajets',      to: '/agence/trajets',      icon: <MapPinned className="w-4 h-4" /> },
    { label: 'Garage',       to: '/agence/garage',       icon: <Wrench className="w-4 h-4" /> },
    { label: 'Recettes',     to: '/agence/recettes',     icon: <Coins className="w-4 h-4" /> },
    { label: 'Rapports',     to: '/agence/rapports',     icon: <FileBarChart2 className="w-4 h-4" /> },
    { label: 'Finances',     to: '/agence/finances',     icon: <Banknote className="w-4 h-4" /> },
    // L’onglet “Comptabilité” reste visible ici pour chef/superviseur/admin si vous le souhaitez
    { label: 'Comptabilité', to: '/agence/comptabilite', icon: <Ticket className="w-4 h-4" /> },
    { label: 'Personnel',    to: '/agence/personnel',    icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: theme.colors?.background || '#f7fafc' }}>
      {/* ===== HEADER ===== */}
      <header className="sticky top-0 z-40 border-b bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/65">
        {/* Ligne branding */}
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 w-full">
            {/* Logo */}
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt="Logo compagnie"
                className="rounded-xl object-contain border bg-white p-1 shrink-0"
                style={{ width: 'clamp(32px, 6vw, 40px)', height: 'clamp(32px, 6vw, 40px)' }}
                onError={(e)=>{ (e.currentTarget as HTMLImageElement).style.display='none'; }}
              />
            ) : (
              <div
                className="grid place-items-center rounded-xl bg-gray-200 shrink-0"
                style={{ width: 'clamp(32px, 6vw, 40px)', height: 'clamp(32px, 6vw, 40px)' }}
                aria-hidden
              >🚌</div>
            )}

            {/* Noms */}
            <div className="min-w-0 flex-1">
              <div
                className="font-extrabold tracking-tight leading-tight break-words whitespace-normal"
                style={{
                  fontSize: 'clamp(16px, 2.6vw, 20px)',
                  background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.secondary})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}
              >
                {company?.nom || 'Compagnie'}
              </div>
              <div className="text-[11px] md:text-xs text-gray-600 leading-snug break-words">
                {user?.agencyName || 'Agence'}
              </div>
            </div>
          </div>
        </div>

        {/* Nav desktop */}
        <div className="hidden md:block border-t bg-white">
          <nav className="max-w-7xl mx-auto px-3 md:px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {tabs.map(tab => {
                const active = location.pathname.startsWith(tab.to);
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={`px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap ${
                      active ? 'text-white shadow' : 'bg-white hover:bg-slate-50 border'
                    }`}
                    style={active
                      ? { background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.secondary})` }
                      : {}}
                  >
                    <span className="inline-flex items-center gap-1.5">{tab.icon}{tab.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Nav mobile */}
        <div className="md:hidden overflow-x-auto border-t bg-white">
          <div className="flex gap-2 p-2 w-max">
            {tabs.map(tab => {
              const active = location.pathname.startsWith(tab.to);
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border shadow-sm whitespace-nowrap ${
                    active ? 'text-white' : 'bg-white'
                  }`}
                  style={active
                    ? { background: `linear-gradient(90deg, ${theme.colors.primary}, ${theme.colors.secondary})` }
                    : {}}
                >
                  <span className="inline-flex items-center gap-1.5">{tab.icon}{tab.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </header>

      {/* ===== CONTENU ===== */}
      <main className="max-w-7xl mx-auto px-3 md:px-4 py-5 md:py-6">
        <Outlet />
      </main>

      {/* ===== FOOTER : Connexion/Déconnexion ===== */}
      <footer className="max-w-7xl mx-auto px-3 md:px-4 pb-6">
        <div className="rounded-2xl border bg-white p-3 md:p-4 shadow-sm flex items-center justify-between gap-3 text-sm">
          <div className="min-w-0">
            <div className="font-semibold break-words">
              {user ? (user.displayName || user.email) : 'Utilisateur non connecté'}
            </div>
            <div className="text-gray-500 text-xs">{rolesArr.join(', ') || '—'}</div>
          </div>

          {user ? (
            <button
              onClick={logout}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 shadow-sm"
            >
              Se déconnecter
            </button>
          ) : (
            <Link
              to="/login"
              className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 shadow-sm"
            >
              Se connecter
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
};

export default AgenceShellPage;
