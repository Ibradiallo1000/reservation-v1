import React from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building,
  ClipboardList,
  Settings,
  Image as ImageIcon,
  BarChart2,
  MessageSquare,
  ChevronRight,
  LogOut,
  Menu,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { collection, query, where, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import useCompanyTheme from "@/hooks/useCompanyTheme";

/* ✅ Contexte du header (dynamique par page) */
import { PageHeaderProvider, usePageHeader } from "@/contexts/PageHeaderContext";

const CompagnieLayout: React.FC = () => {
  const location = useLocation();
  const { user, logout, company } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const theme = useCompanyTheme(company);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  // --- Badges (preuves reçues + avis en attente)
  const [onlineProofsCount, setOnlineProofsCount] = React.useState(0);
  const [pendingReviewsCount, setPendingReviewsCount] = React.useState(0);

  React.useEffect(() => {
    if (!user?.companyId) return;
    let unsubs: Array<() => void> = [];
    const countsByAgence = new Map<string, number>();

    (async () => {
      const agencesSnap = await getDocs(collection(db, "companies", user.companyId, "agences"));
      const agenceIds = agencesSnap.docs.map((d) => d.id);

      agenceIds.forEach((agenceId) => {
        const qAg = query(
          collection(db, "companies", user.companyId, "agences", agenceId, "reservations"),
          where("statut", "==", "preuve_recue")
        );
        const unsub = onSnapshot(qAg, (snap) => {
          countsByAgence.set(agenceId, snap.size);
          const total = Array.from(countsByAgence.values()).reduce((a, b) => a + b, 0);
          setOnlineProofsCount(total);
        });
        unsubs.push(unsub);
      });
    })();

    return () => unsubs.forEach((u) => u());
  }, [user?.companyId]);

  React.useEffect(() => {
    if (!user?.companyId) return;
    const qAvis = query(
      collection(db, "avis"),
      where("companyId", "==", user.companyId),
      where("visible", "==", false)
    );
    const unsub = onSnapshot(qAvis, (snap) => setPendingReviewsCount(snap.size));
    return () => unsub();
  }, [user?.companyId]);

  return (
    <PageHeaderProvider>
      <LayoutInner
        theme={theme}
        isActive={isActive}
        onlineProofsCount={onlineProofsCount}
        pendingReviewsCount={pendingReviewsCount}
        userInitial={user?.displayName?.charAt(0) || user?.email?.charAt(0) || "?"}
        userName={user?.displayName || user?.email || ""}
        userRole={(user as any)?.role}
        companyName={company?.nom || "Compagnie"}
        logoUrl={company?.logoUrl}
        onLogout={logout}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
      />
    </PageHeaderProvider>
  );
};

const LayoutInner: React.FC<{
  theme: any;
  isActive: (p: string) => boolean;
  onlineProofsCount: number;
  pendingReviewsCount: number;
  userInitial: string;
  userName: string;
  userRole?: string;
  companyName: string;
  logoUrl?: string;
  onLogout: () => void;
  onOpenMobileMenu: () => void;
}> = (props) => {
  const {
    theme,
    isActive,
    onlineProofsCount,
    pendingReviewsCount,
    userInitial,
    userName,
    userRole,
    companyName,
    logoUrl,
    onLogout,
    onOpenMobileMenu,
  } = props;

  const { header } = usePageHeader();
  const defaultGradient = `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Sidebar FIXE desktop */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col justify-between text-white shadow-xl z-40 overflow-y-auto"
        style={{ backgroundColor: theme.colors.primary }}
      >
        <div className="flex-1 flex flex-col justify-between">
          <div>
            {/* Header logo + nom */}
            <div className="p-6 border-b border-white/20 flex items-center gap-3">
              {logoUrl && <img src={logoUrl} alt="logo" className="h-10 w-10 rounded-full shadow" />}
              <h1 className="text-xl font-bold">{companyName}</h1>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col p-4 space-y-2">
              <NavItem to="/compagnie/dashboard" label="Tableau de bord" icon={<LayoutDashboard />} active={isActive("/compagnie/dashboard")} theme={theme} />
              <NavItem to="/compagnie/reservations-en-ligne" label="Réservations en ligne" icon={<ClipboardList />} active={isActive("/compagnie/reservations-en-ligne")} badge={onlineProofsCount} theme={theme} />
              <NavItem to="/compagnie/reservations" label="Réservations" icon={<ClipboardList />} active={isActive("/compagnie/reservations")} theme={theme} />
              <NavItem to="/compagnie/agences" label="Agences" icon={<Building />} active={isActive("/compagnie/agences")} theme={theme} />
              <NavItem to="/compagnie/avis-clients" label="Avis Clients" icon={<MessageSquare />} active={isActive("/compagnie/avis-clients")} badge={pendingReviewsCount} theme={theme} />
              <NavItem to="/compagnie/payment-settings" label="Moyens de paiement" icon={<Settings />} active={isActive("/compagnie/payment-settings")} theme={theme} />
              <NavItem to="/compagnie/parametres" label="Paramètres" icon={<Settings />} active={isActive("/compagnie/parametres")} theme={theme} />

              <div className="mt-4 pt-4 border-t border-white/20">
                <p className="text-xs uppercase opacity-80 px-4 mb-2">Analytique</p>
                <NavItem to="/compagnie/images" label="Médias" icon={<ImageIcon />} active={isActive("/compagnie/images")} theme={theme} />
                {/* ✅ Nouveau : Comptabilité compagnie */}
                <NavItem
                  to="/compagnie/comptabilite"
                  label="Comptabilité"
                  icon={<BarChart2 />}
                  active={isActive("/compagnie/comptabilite")}
                  theme={theme}
                />
              </div>
            </nav>
          </div>

          {/* Profil fixé en bas */}
          <div className="p-4 border-t border-white/20 bg-white/0 sticky bottom-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium"
                  style={{ backgroundColor: theme.colors.secondary }}
                >
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{userName}</p>
                  <p className="text-xs opacity-80">{userRole}</p>
                </div>
              </div>
              <button onClick={onLogout} className="p-2 rounded-md hover:bg-white/20 transition-colors">
                <LogOut className="h-4 w-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Contenu décalé */}
      <main className="md:ml-64">
        <div className="h-screen flex flex-col">
          {/* Header mobile */}
          <header className="bg-white shadow-sm p-4 md:hidden flex items-center justify-between">
            <button onClick={onOpenMobileMenu} className="p-2 rounded-md text-gray-500 hover:bg-gray-100">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{companyName}</h1>
            <div className="w-5 h-5" />
          </header>

          {/* Header collant dynamique */}
          <div className="sticky top-0 z-30">
            <div
              className="px-6 py-4 border-b shadow-sm flex flex-col gap-2 md:flex-row md:items-center md:justify-between"
              style={{
                background: header.bg || defaultGradient,
                color: header.fg || "#fff",
                borderColor: "rgba(255,255,255,0.15)",
              }}
            >
              <div>
                <div className="text-2xl font-bold leading-tight">{header.title}</div>
                {header.subtitle && <div className="text-sm opacity-90">{header.subtitle}</div>}
              </div>
              <div className="flex items-center gap-2">
                {header.right ?? header.actions}
              </div>
            </div>
          </div>

          {/* Zone scrollable */}
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
      active ? "font-bold shadow-sm" : "opacity-90 hover:opacity-100"
    }`}
    style={{
      backgroundColor: active ? theme.colors.secondary : "transparent",
      color: active ? "#fff" : "#f1f1f1",
    }}
  >
    <span>{icon}</span>
    <span className="flex-1 text-sm">{label}</span>
    {typeof badge === "number" && badge > 0 && (
      <span className="ml-auto bg-red-500 text-xs text-white px-2 py-1 rounded-full">{badge}</span>
    )}
    <ChevronRight className={`w-4 h-4 ${active ? "opacity-100 text-yellow-300" : "opacity-0"}`} />
  </Link>
);

export default CompagnieLayout;