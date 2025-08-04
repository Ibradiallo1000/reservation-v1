import React, { useState, useMemo } from 'react';
import { Link, Outlet, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import {
  LayoutDashboard,
  Ticket,
  MapPinned,
  Coins,
  Users,
  ClipboardList,
  Settings,
  LogOut
} from 'lucide-react';

interface MenuItem {
  label: string;
  path?: string;
  icon: React.ReactNode;
  submenu?: SubMenuItem[];
  permission?: string;
}

interface SubMenuItem {
  label: string;
  path: string;
  permission?: string;
}

const Sidebar: React.FC = () => {
  const { user, logout, hasPermission, company } = useAuth();
  const theme = useCompanyTheme(company);
  const location = useLocation();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(true);

  const menuItems: MenuItem[] = useMemo(() => [
    { label: 'Dashboard', path: '/agence/dashboard', icon: <LayoutDashboard className="w-5 h-5" />, permission: 'view_dashboard' },
    { label: 'Guichet', path: '/agence/guichet', icon: <Ticket className="w-5 h-5" />, permission: 'access_ticketing' },
    { label: 'Réservations', path: '/agence/reservations', icon: <ClipboardList className="w-5 h-5" />, permission: 'manage_bookings' },
    { label: 'Embarquement', path: '/agence/embarquement', icon: <MapPinned className="w-5 h-5" />, permission: 'embarquement' }, // ✅ ajouté
    { label: 'Trajets', path: '/agence/trajets', icon: <MapPinned className="w-5 h-5" />, permission: 'manage_routes' },
    { label: 'Recettes', path: '/agence/recettes', icon: <Coins className="w-5 h-5" />, permission: 'manage_income' },
    { label: 'Personnel', path: '/agence/personnel', icon: <Users className="w-5 h-5" />, permission: 'manage_staff' },
  ], [hasPermission]);

  const toggleSubMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path?: string, submenu?: SubMenuItem[]) => {
    if (path) return matchPath({ path }, location.pathname);
    if (submenu) return submenu.some(item => matchPath({ path: item.path }, location.pathname));
    return false;
  };

  return (
    <div className="flex min-h-screen">
      {/* Bouton Burger pour tablette/mobile */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-md shadow-md"
        style={{ backgroundColor: theme.colors.secondary, color: theme.colors.text }}
        onClick={() => setIsOpen(!isOpen)}
      >
        ☰
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed h-full shadow-lg flex flex-col transition-all duration-300 z-40 
          ${isOpen ? "w-64" : "w-0"} overflow-hidden`}
        style={{
          backgroundColor: theme.colors.primary,
          color: theme.colors.text,
        }}
      >
        {/* Logo & Nom Agence */}
        <div className="p-5 border-b border-white/20 flex items-center gap-3">
          {user?.agencyLogoUrl ? (
            <img
              src={user.agencyLogoUrl}
              alt={user.agencyName}
              className="h-10 w-10 rounded-full object-cover border border-gray-200"
              onError={(e) => { (e.target as HTMLImageElement).src = '/default-company.png'; }}
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center font-bold uppercase"
              style={{ backgroundColor: theme.colors.secondary, color: theme.colors.text }}
            >
              {user?.agencyName?.charAt(0) || 'A'}
            </div>
          )}
          <div>
            <h1 className="text-lg font-bold">{user?.agencyName || 'Tableau de bord'}</h1>
            <p className="text-xs opacity-80">
              Version {import.meta.env.VITE_APP_VERSION || '1.0.0'}
            </p>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-2">
            {menuItems.map((item) => {
              const canAccess = !item.permission || hasPermission(item.permission);

              // ✅ Debug clair
              console.log(
                `Sidebar Debug → Label: ${item.label}, Permission demandée: ${item.permission}, Rôle actuel: ${user?.role}, Accès: ${canAccess}`
              );

              if (!canAccess) return null;

              const active = isActive(item.path, item.submenu);
              const linkStyle = {
                backgroundColor: active ? theme.colors.secondary : 'transparent',
                color: active ? theme.colors.text : theme.colors.text,
              };

              return (
                <li key={item.label}>
                  <Link
                    to={item.path || '#'}
                    style={linkStyle}
                    className="flex items-center px-4 py-3 text-sm font-medium rounded-lg transition hover:opacity-90"
                  >
                    <span className="mr-3">{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User Info */}
        <div className="p-5 border-t border-white/20 text-sm">
          <div className="flex items-center justify-between">
            <div>
              <p>{user?.displayName || user?.email}</p>
              <p className="text-xs opacity-80">{user?.role}</p>
            </div>
            <div className="flex space-x-2">
              <Link
                to="/agence/parametres"
                title="Paramètres"
                className="p-2 rounded-md hover:opacity-80"
                style={{ color: theme.colors.text }}
              >
                <Settings className="h-5 w-5" />
              </Link>
              <button
                onClick={logout}
                title="Déconnexion"
                className="p-2 rounded-md hover:opacity-80"
                style={{ color: theme.colors.text }}
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenu principal */}
      <main
        className={`flex-1 p-6 overflow-auto bg-gray-50 transition-all duration-300 
        ${isOpen ? "ml-64" : "ml-0"}`}
      >
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Sidebar;
