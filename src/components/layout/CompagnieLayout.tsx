import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building, MapPinned, Users, ClipboardList, Settings,
  Image, Wallet, BarChart2, MessageSquare, ChevronRight, LogOut
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const CompagnieLayout: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth(); // ✅ on récupère l’utilisateur connecté

  const isActive = (path: string) => location.pathname.includes(path);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-72 bg-gradient-to-b from-gray-800 to-gray-900 text-white flex flex-col justify-between shadow-xl">
        {/* Haut : nom + menu */}
        <div>
          <div className="p-6 border-b border-gray-700">
            <h1 className="text-2xl font-bold flex items-center">
              <span className="bg-emerald-500 text-white rounded-lg p-1 mr-3">
                <Building className="w-6 h-6" />
              </span>
              Espace Compagnie
            </h1>
          </div>

          <nav className="flex flex-col p-4 space-y-1">
            <NavItem to="/compagnie/dashboard" icon={<LayoutDashboard className="w-5 h-5" />} active={isActive('dashboard')}>
              Tableau de bord
            </NavItem>
            <NavItem to="/compagnie/agences" icon={<Building className="w-5 h-5" />} active={isActive('agences')}>
              Agences
            </NavItem>
            <NavItem to="/compagnie/messages" icon={<MessageSquare className="w-5 h-5" />} active={isActive('messages')}>
              Messages
              <span className="ml-auto bg-gray-600 text-xs text-white px-2 py-1 rounded-full">5</span>
            </NavItem>
            <NavItem to="/compagnie/personnel" icon={<Users className="w-5 h-5" />} active={isActive('personnel')}>
              Personnel
            </NavItem>
            <NavItem to="/compagnie/reservations" icon={<ClipboardList className="w-5 h-5" />} active={isActive('reservations')}>
              Réservations
            </NavItem>
            <NavItem to="/compagnie/images" icon={<Image className="w-5 h-5" />} active={isActive('images')}>
              Bibliothèque média
            </NavItem>
            <NavItem to="/compagnie/finances" icon={<Wallet className="w-5 h-5" />} active={isActive('finances')}>
              Finances
            </NavItem>
            <NavItem to="/compagnie/statistiques" icon={<BarChart2 className="w-5 h-5" />} active={isActive('statistiques')}>
              Statistiques
            </NavItem>
            <div className="mt-6 pt-4 border-t border-gray-700">
              <NavItem to="/compagnie/parametres" icon={<Settings className="w-5 h-5" />} active={isActive('parametres')}>
                Paramètres
              </NavItem>
            </div>
          </nav>
        </div>

        {/* Bas : utilisateur + déconnexion */}
        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium truncate">{user?.displayName || user?.email}</p>
              <p className="text-xs text-gray-400 capitalize">{user?.role}</p>
            </div>
            <div className="flex space-x-2">
              <Link to="/compagnie/parametres" title="Paramètres" className="p-1 rounded-md hover:bg-gray-700 text-gray-300 hover:text-white">
                <Settings className="h-5 w-5" />
              </Link>
              <button
                onClick={logout}
                title="Déconnexion"
                className="p-1 rounded-md hover:bg-red-600 text-gray-300 hover:text-white"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <header className="bg-white shadow-sm p-4 md:hidden">
            <h1 className="text-xl font-semibold text-gray-800">Espace Compagnie</h1>
          </header>
          <div className="flex-1 overflow-y-auto p-6 bg-white rounded-tl-3xl shadow-inner">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

// ✅ Composant NavItem
const NavItem: React.FC<{
  to: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}> = ({ to, icon, active = false, children }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active
        ? 'bg-gray-700 text-white shadow-md'
        : 'text-gray-300 hover:bg-gray-700/50 hover:text-white'
    }`}
  >
    <span className={`${active ? 'text-emerald-400' : 'text-gray-400'}`}>
      {icon}
    </span>
    <span className="flex-1 font-medium">{children}</span>
    <ChevronRight className={`w-4 h-4 ${active ? 'opacity-100 text-emerald-400' : 'opacity-0'}`} />
  </Link>
);

export default CompagnieLayout;
