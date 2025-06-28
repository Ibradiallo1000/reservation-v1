import React, { useState, useMemo } from 'react';
import { Link, Outlet, useLocation, matchPath } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Ticket,
  MapPinned,
  Mail,
  Wallet,
  Coins,
  Receipt,
  Users,
  ClipboardList,
  ChevronDown,
  ChevronUp,
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

interface CustomUser {
  displayName?: string;
  email?: string;
  role?: string;
  agencyName?: string;
  permissions?: string[];
}

interface AuthContextType {
  user: CustomUser | null;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
}

const cn = (...classes: string[]) => classes.filter(Boolean).join(' ');

const AgenceLayout: React.FC = () => {
  const { user, logout, hasPermission } = useAuth() as AuthContextType;
  const location = useLocation();
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  const menuItems: MenuItem[] = useMemo(() => [
    {
      label: 'Dashboard',
      path: '/agence/dashboard',
      icon: <LayoutDashboard className="w-5 h-5" />,
      permission: 'view_dashboard'
    },
    
    {
      label: 'Guichet',
      path: '/agence/guichet',
      icon: <Ticket className="w-5 h-5" />,
      permission: 'access_ticketing'
    },
    {
      label: 'Réservations',
      path: '/agence/reservations',
      icon: <ClipboardList className="w-5 h-5" />,
      permission: 'manage_bookings'
    },

    {
      label: 'Trajets',
      path: '/agence/trajets',
      icon: <MapPinned className="w-5 h-5" />,
      permission: 'manage_routes'
    },
  
    {
      label: 'Recettes',
      path: '/agence/recettes',
      icon: <Coins className="w-5 h-5" />,
      permission: 'manage_income'
    },
    
    {
      label: 'Personnel',
      path: '/agence/personnel',
      icon: <Users className="w-5 h-5" />,
      permission: 'manage_staff'
    },

  ], []);

  const toggleSubMenu = (label: string) => {
    setOpenMenus(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path?: string, submenu?: SubMenuItem[]) => {
    if (path) return matchPath(path, location.pathname);
    if (submenu) return submenu.some(item => matchPath(item.path, location.pathname));
    return false;
  };

  return (
    <div className="flex min-h-screen bg-[#f4f6fc]">
      <aside className="w-64 bg-white shadow-md text-gray-900 flex flex-col fixed h-full">
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold text-blue-800">{user?.agencyName || 'Tableau de bord'}</h1>
          <p className="text-xs text-gray-500 mt-1">Version {import.meta.env.VITE_APP_VERSION || '1.0.0'}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-2">
            {menuItems.map((item) => {
              const canAccess = !item.permission || hasPermission(item.permission);
              if (!canAccess) return null;

              return item.submenu ? (
                <div key={item.label}>
                  <button
                    onClick={() => toggleSubMenu(item.label)}
                    className={cn(
                      "flex items-center w-full px-4 py-3 text-sm font-medium rounded-md transition-colors",
                      "hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-200",
                      isActive(undefined, item.submenu) ? "bg-blue-100 text-blue-700" : ""
                    )}
                  >
                    <span className="mr-3">{item.icon}</span>
                    {item.label}
                    {openMenus[item.label] ? (
                      <ChevronUp className="ml-auto h-4 w-4" />
                    ) : (
                      <ChevronDown className="ml-auto h-4 w-4" />
                    )}
                  </button>

                  {openMenus[item.label] && (
                    <div className="mt-1 space-y-1 ml-12">
                      {item.submenu.map((subItem) => {
                        const canAccessSub = !subItem.permission || hasPermission(subItem.permission);
                        if (!canAccessSub) return null;

                        return (
                          <Link
                            key={subItem.path}
                            to={subItem.path}
                            className={cn(
                              "block px-3 py-2 text-sm rounded-md transition-colors",
                              "hover:bg-blue-50",
                              matchPath(subItem.path, location.pathname) ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-600"
                            )}
                          >
                            {subItem.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  key={item.path || item.label}
                  to={item.path || '#'}
                  className={cn(
                    "flex items-center px-4 py-3 text-sm font-medium rounded-md transition-colors",
                    "hover:bg-blue-100",
                    isActive(item.path) ? "bg-blue-100 text-blue-700" : "text-gray-800"
                  )}
                >
                  <span className="mr-3">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {user?.displayName || user?.email}
              </p>
              <p className="text-xs text-gray-500 capitalize">
                {user?.role}
              </p>
            </div>
            <div className="flex space-x-2">
              <Link
                to="/agence/parametres"
                className="p-1 rounded-md hover:bg-blue-100 text-gray-600 hover:text-blue-800"
                title="Paramètres"
              >
                <Settings className="h-5 w-5" />
              </Link>
              <button
                onClick={logout}
                className="p-1 rounded-md hover:bg-red-100 text-gray-600 hover:text-red-800"
                title="Déconnexion"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 ml-64 p-6 overflow-auto bg-[#f4f6fc]">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AgenceLayout;
