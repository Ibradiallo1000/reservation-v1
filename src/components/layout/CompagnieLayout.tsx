// ✅ src/layouts/CompagnieLayout.tsx

import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Building, Users, ClipboardList, Settings,
  Image, Wallet, BarChart2, MessageSquare, ChevronRight, LogOut,
  Menu
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import useCompanyTheme from '@/hooks/useCompanyTheme';

const CompagnieLayout: React.FC = () => {
  const location = useLocation();
  const { user, logout, company } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const theme = useCompanyTheme(company);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const [onlineProofsCount, setOnlineProofsCount] = React.useState(0);
  const proofsCountRef = React.useRef(0);
  const [pendingReviewsCount, setPendingReviewsCount] = React.useState(0);

  React.useEffect(() => {
    if (!user?.companyId) return;
    const unsubscribeFns: (() => void)[] = [];

    const fetchAgencesAndListen = async () => {
      const agencesSnap = await getDocs(collection(db, 'companies', user.companyId, 'agences'));
      const agenceIds = agencesSnap.docs.map(doc => doc.id);

      agenceIds.forEach(agenceId => {
        const q = query(
          collection(db, 'companies', user.companyId, 'agences', agenceId, 'reservations'),
          where('statut', '==', 'preuve_recue')
        );
        const unsubscribe = onSnapshot(q, (snap) => {
          const count = snap.size;
          if (count > 0 && count > proofsCountRef.current) playNotificationSound();
          proofsCountRef.current = count;
          setOnlineProofsCount(count);
        });
        unsubscribeFns.push(unsubscribe);
      });
    };

    fetchAgencesAndListen();
    return () => unsubscribeFns.forEach(unsub => unsub());
  }, [user?.companyId]);

  React.useEffect(() => {
    if (!user?.companyId) return;
    const q = query(
      collection(db, 'avis'),
      where('companyId', '==', user.companyId),
      where('visible', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setPendingReviewsCount(snap.size);
    });
    return () => unsubscribe();
  }, [user?.companyId]);

  const playNotificationSound = () => {
    try {
      const audio = new Audio('/son.mp3');
      audio.volume = 0.5;
      audio.play().catch((err) => console.warn('Lecture bloquée', err));
    } catch (e) {
      console.error('Erreur audio', e);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <aside
        className="hidden md:flex md:w-64 flex-col justify-between text-white shadow-xl"
        style={{ backgroundColor: theme.colors.primary }}
      >
        <div className="flex-1 flex flex-col justify-between">
          <div>
            {/* Header avec logo et nom de la compagnie */}
            <div className="p-6 border-b border-white/20 flex items-center gap-3">
              {company?.logoUrl && (
                <img src={company.logoUrl} alt="logo" className="h-10 w-10 rounded-full shadow" />
              )}
              <h1 className="text-xl font-bold">{company?.nom || 'Compagnie'}</h1>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col p-4 space-y-2">
              <NavItem
                to="/compagnie/dashboard"
                label="Tableau de bord"
                icon={<LayoutDashboard />}
                active={isActive('/compagnie/dashboard')}
                theme={theme}
              />
              <NavItem
                to="/compagnie/reservations-en-ligne"
                label="Réservations en ligne"
                icon={<ClipboardList />}
                active={isActive('/compagnie/reservations-en-ligne')}
                badge={onlineProofsCount}
                theme={theme}
              />
              <NavItem
                to="/compagnie/reservations"
                label="Réservations"
                icon={<ClipboardList />}
                active={isActive('/compagnie/reservations')}
                theme={theme}
              />
              <NavItem
                to="/compagnie/agences"
                label="Agences"
                icon={<Building />}
                active={isActive('/compagnie/agences')}
                theme={theme}
              />
              <NavItem
                to="/compagnie/avis-clients"
                label="Avis Clients"
                icon={<MessageSquare />}
                active={isActive('/compagnie/avis-clients')}
                badge={pendingReviewsCount}
                theme={theme}
              />
              <NavItem
                to="/compagnie/payment-settings"
                label="Moyens de paiement"
                icon={<Settings />}
                active={isActive('/compagnie/payment-settings')}
                theme={theme}
              />
              <NavItem
                to="/compagnie/parametres"
                label="Paramètres"
                icon={<Settings />}
                active={isActive('/compagnie/parametres')}
                theme={theme}
              />
              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-xs uppercase opacity-80 px-4 mb-2">Analytique</p>
                <NavItem
                  to="/compagnie/images"
                  label="Médias"
                  icon={<Image />}
                  active={isActive('/compagnie/images')}
                  theme={theme}
                />
                <NavItem
                  to="/compagnie/finances"
                  label="Finances"
                  icon={<Wallet />}
                  active={isActive('/compagnie/finances')}
                  theme={theme}
                />
                <NavItem
                  to="/compagnie/statistiques"
                  label="Statistiques"
                  icon={<BarChart2 />}
                  active={isActive('/compagnie/statistiques')}
                  theme={theme}
                />
              </div>
            </nav>
          </div>

          {/* Profil fixé en bas */}
          <div className="p-4 border-t border-white/20 sticky bottom-0 bg-opacity-90">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: theme.colors.secondary }}
                >
                  {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium truncate">{user?.displayName || user?.email}</p>
                  <p className="text-xs opacity-80">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="p-2 rounded-md hover:bg-white/20 transition-colors"
              >
                <LogOut className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          <header className="bg-white shadow-sm p-4 md:hidden flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{company?.nom || 'Compagnie'}</h1>
            <div className="w-5 h-5"></div>
          </header>
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

const NavItem: React.FC<{
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  badge?: number;
  theme: any;
}> = ({ to, label, icon, active, badge, theme }) => (
  <Link
    to={to}
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
      active
        ? 'font-bold shadow-sm'
        : 'opacity-90 hover:opacity-100'
    }`}
    style={{
      backgroundColor: active ? theme.colors.secondary : 'transparent',
      color: active ? '#fff' : '#f1f1f1',
    }}
  >
    <span>{icon}</span>
    <span className="flex-1 text-sm">{label}</span>
    {typeof badge === 'number' && badge > 0 && (
      <span className="ml-auto bg-red-500 text-xs text-white px-2 py-1 rounded-full">
        {badge}
      </span>
    )}
    <ChevronRight
      className={`w-4 h-4 ${active ? 'opacity-100 text-yellow-300' : 'opacity-0'}`}
    />
  </Link>
);

export default CompagnieLayout;
