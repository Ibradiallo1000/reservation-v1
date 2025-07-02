import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building, Users, ClipboardList, Settings,
  Image, Wallet, BarChart2, MessageSquare, ChevronRight, LogOut,
  Menu, X
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const CompagnieLayout: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const companyInfo = location.state?.companyInfo || null;

  const isActive = (path: string) => location.pathname === path;

  const colors = {
    primary: companyInfo?.couleurPrimaire ? `bg-[${companyInfo.couleurPrimaire}]` : 'bg-indigo-600',
    primaryHover: 'hover:bg-indigo-700',
    primaryLight: 'bg-indigo-50',
    primaryText: 'text-indigo-600',
    secondary: 'bg-teal-500',
    secondaryHover: 'hover:bg-teal-600',
    dark: 'bg-slate-800',
    darker: 'bg-slate-900',
    light: 'bg-slate-50',
    card: 'bg-white',
    badge: 'bg-amber-500'
  };

  return (
    <div className={`flex min-h-screen ${colors.light}`}>
      {/* Sidebar - Desktop */}
      <aside className={`hidden md:flex md:w-64 flex-col justify-between ${colors.darker} text-white shadow-xl border-r border-slate-700`}>
        <div>
          <div className="p-6 border-b border-slate-700">
            <h1 className="text-2xl font-bold flex items-center">
              <span className={`${colors.primary} text-white rounded-lg p-2 mr-3 shadow-md`}>
                <Building className="w-5 h-5" />
              </span>
              <span className="bg-gradient-to-r from-indigo-400 to-teal-400 bg-clip-text text-transparent">
                Espace Pro
              </span>
            </h1>
          </div>

          <nav className="flex flex-col p-4 space-y-2">
            <NavItem to="/compagnie/dashboard" icon={<LayoutDashboard className="w-5 h-5" />} active={isActive('/compagnie/dashboard')}>
              Tableau de bord
            </NavItem>

            <NavItem to="/compagnie/agences" icon={<Building className="w-5 h-5" />} active={isActive('/compagnie/agences')}>
              Agences
            </NavItem>

            <NavItem to="/compagnie/messages" icon={<MessageSquare className="w-5 h-5" />} active={isActive('/compagnie/messages')}>
              Messages <span className={`ml-auto ${colors.badge} text-xs text-white px-2 py-1 rounded-full animate-pulse`}>5</span>
            </NavItem>

            <NavItem to="/compagnie/personnel" icon={<Users className="w-5 h-5" />} active={isActive('/compagnie/personnel')}>
              Personnel
            </NavItem>

            <NavItem to="/compagnie/reservations" icon={<ClipboardList className="w-5 h-5" />} active={isActive('/compagnie/reservations')}>
              Réservations
            </NavItem>

            <NavItem to="/compagnie/reservations-en-ligne" icon={<ClipboardList className="w-5 h-5" />} active={isActive('/compagnie/reservations-en-ligne')}>
              Réservations en ligne
            </NavItem>

            <NavItem to="/compagnie/guichet" icon={<Wallet className="w-5 h-5" />} active={isActive('/compagnie/guichet')}>
              Guichet
            </NavItem>

            <NavItem to="/compagnie/payment-settings" icon={<Settings className="w-5 h-5" />} active={isActive('/compagnie/payment-settings')}>
              Moyens de paiement
            </NavItem>

            {/* ✅ AJOUT DU PARAMÈTRES */}
            <NavItem to="/compagnie/parametres" icon={<Settings className="w-5 h-5" />} active={isActive('/compagnie/parametres')}>
              Paramètres
            </NavItem>

            <div className="mt-4 pt-4 border-t border-slate-700">
              <p className="text-xs uppercase text-slate-400 px-4 mb-2">Analytique</p>

              <NavItem to="/compagnie/images" icon={<Image className="w-5 h-5" />} active={isActive('/compagnie/images')}>
                Médias
              </NavItem>

              <NavItem to="/compagnie/finances" icon={<Wallet className="w-5 h-5" />} active={isActive('/compagnie/finances')}>
                Finances
              </NavItem>

              <NavItem to="/compagnie/statistiques" icon={<BarChart2 className="w-5 h-5" />} active={isActive('/compagnie/statistiques')}>
                Statistiques
              </NavItem>
            </div>
          </nav>
        </div>

        {/* Bottom */}
        <div className="p-4 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full ${colors.primary} flex items-center justify-center text-white font-medium`}>
                {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium truncate">{user?.displayName || user?.email}</p>
                <p className="text-xs text-slate-400">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={logout}
              title="Déconnexion"
              className="p-2 rounded-md hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <header className={`${colors.card} shadow-sm p-4 md:hidden flex items-center justify-between`}>
            <button onClick={() => setMobileMenuOpen(true)} className="p-2 rounded-md text-slate-500 hover:bg-slate-100">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-slate-800">Espace Pro</h1>
            <div className="w-5 h-5"></div>
          </header>

          <div className={`flex-1 overflow-y-auto p-4 md:p-8 ${colors.card} md:rounded-tl-3xl shadow-inner`}>
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile Sidebar */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />

          <div className={`absolute left-0 top-0 bottom-0 w-72 ${colors.darker} shadow-xl`}>
            <div className="p-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-md text-slate-300 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex flex-col p-2 space-y-1 overflow-y-auto h-[calc(100%-120px)]">
              <MobileNavItem to="/compagnie/dashboard" icon={<LayoutDashboard className="w-5 h-5" />} active={isActive('/compagnie/dashboard')}>
                Tableau de bord
              </MobileNavItem>

              <MobileNavItem to="/compagnie/agences" icon={<Building className="w-5 h-5" />} active={isActive('/compagnie/agences')}>
                Agences
              </MobileNavItem>

              <MobileNavItem to="/compagnie/messages" icon={<MessageSquare className="w-5 h-5" />} active={isActive('/compagnie/messages')}>
                Messages <span className={`${colors.badge} text-xs text-white px-2 py-0.5 rounded-full`}>5</span>
              </MobileNavItem>

              <MobileNavItem to="/compagnie/personnel" icon={<Users className="w-5 h-5" />} active={isActive('/compagnie/personnel')}>
                Personnel
              </MobileNavItem>

              <MobileNavItem to="/compagnie/reservations" icon={<ClipboardList className="w-5 h-5" />} active={isActive('/compagnie/reservations')}>
                Réservations
              </MobileNavItem>

              <MobileNavItem to="/compagnie/reservations-en-ligne" icon={<ClipboardList className="w-5 h-5" />} active={isActive('/compagnie/reservations-en-ligne')}>
                Réservations en ligne
              </MobileNavItem>

              <MobileNavItem to="/compagnie/guichet" icon={<Wallet className="w-5 h-5" />} active={isActive('/compagnie/guichet')}>
                Guichet
              </MobileNavItem>

              <MobileNavItem to="/compagnie/payment-settings" icon={<Settings className="w-5 h-5" />} active={isActive('/compagnie/payment-settings')}>
                Moyens de paiement
              </MobileNavItem>

              {/* ✅ AJOUT DU PARAMÈTRES MOBILE */}
              <MobileNavItem to="/compagnie/parametres" icon={<Settings className="w-5 h-5" />} active={isActive('/compagnie/parametres')}>
                Paramètres
              </MobileNavItem>

              <div className="mt-2 pt-2 border-t border-slate-700">
                <p className="text-xs uppercase text-slate-400 px-3 mb-1">Analytique</p>

                <MobileNavItem to="/compagnie/images" icon={<Image className="w-5 h-5" />} active={isActive('/compagnie/images')}>
                  Médias
                </MobileNavItem>

                <MobileNavItem to="/compagnie/finances" icon={<Wallet className="w-5 h-5" />} active={isActive('/compagnie/finances')}>
                  Finances
                </MobileNavItem>

                <MobileNavItem to="/compagnie/statistiques" icon={<BarChart2 className="w-5 h-5" />} active={isActive('/compagnie/statistiques')}>
                  Statistiques
                </MobileNavItem>
              </div>
            </nav>

            <div className={`absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700 ${colors.darker}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full ${colors.primary} flex items-center justify-center text-white font-medium`}>
                    {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white truncate max-w-[120px]">{user?.displayName || user?.email}</p>
                    <p className="text-xs text-slate-400">{user?.role}</p>
                  </div>
                </div>
                <button onClick={logout} className="p-2 rounded-md text-slate-300 hover:bg-slate-700 hover:text-white">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NavItem: React.FC<{
  to: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}> = ({ to, icon, active = false, children }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
      active ? 'bg-slate-700 text-white font-medium shadow-sm' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
    }`}
  >
    <span className={`${active ? 'text-teal-400' : 'text-slate-400'}`}>{icon}</span>
    <span className="flex-1 text-sm">{children}</span>
    <ChevronRight className={`w-4 h-4 transition-transform ${active ? 'opacity-100 text-teal-400' : 'opacity-0'}`} />
  </Link>
);

const MobileNavItem: React.FC<{
  to: string;
  icon: React.ReactNode;
  active?: boolean;
  children: React.ReactNode;
}> = ({ to, icon, active = false, children }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-3 rounded-lg mx-1 transition-colors ${
      active ? 'bg-slate-700 text-white font-medium' : 'text-slate-300 hover:bg-slate-700/50'
    }`}
  >
    <span className={`${active ? 'text-teal-400' : 'text-slate-400'}`}>{icon}</span>
    <span className="flex-1 text-sm">{children}</span>
  </Link>
);

export default CompagnieLayout;
