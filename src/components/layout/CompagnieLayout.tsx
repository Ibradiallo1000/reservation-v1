// src/components/layout/CompagnieLayout.tsx
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
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import useCompanyTheme from "@/hooks/useCompanyTheme";
import {
  PageHeaderProvider,
  usePageHeader,
} from "@/contexts/PageHeaderContext";

/* ================= RÔLES ================= */
const roleLabels: Record<string, string> = {
  admin_compagnie: "CEO",
  chefAgence: "Chef d’agence",
  comptable: "Comptable",
  superviseur: "Superviseur",
  guichetier: "Guichetier",
  compagnie: "Compte Compagnie",
};

/* ================= NAVIGATION (DONNÉES) ================= */
const NAV = [
  {
    label: "Tableau de bord",
    path: "/compagnie/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Réservations",
    path: "/compagnie/reservations",
    icon: ClipboardList,
  },
  {
    label: "Agences",
    path: "/compagnie/agences",
    icon: Building,
  },
  {
    label: "Avis clients",
    path: "/compagnie/avis-clients",
    icon: MessageSquare,
  },
  {
    label: "Configuration",
    path: "/compagnie/parametres",
    icon: Settings,
  },
];

const NAV_ANALYTICS = [
  {
    label: "Médias",
    path: "/compagnie/images",
    icon: ImageIcon,
  },
  {
    label: "Comptabilité",
    path: "/compagnie/comptabilite",
    icon: BarChart2,
  },
];

/* ================= LAYOUT PRINCIPAL ================= */
const CompagnieLayout: React.FC = () => {
  const location = useLocation();
  const { user, logout, company } = useAuth();
  const theme = useCompanyTheme(company);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const isActive = (path: string) =>
    location.pathname === path ||
    location.pathname.startsWith(path + "/");

  /* ===== BADGES ===== */
  const [onlineProofsCount, setOnlineProofsCount] = React.useState(0);
  const [pendingReviewsCount, setPendingReviewsCount] = React.useState(0);

  /* ===== RÉSERVATIONS EN ATTENTE (PREUVES) ===== */
  React.useEffect(() => {
    if (!user?.companyId) return;
    let unsubs: Array<() => void> = [];
    const countsByAgence = new Map<string, number>();

    (async () => {
      const agencesSnap = await getDocs(
        collection(db, "companies", user.companyId, "agences")
      );
      const agenceIds = agencesSnap.docs.map((d) => d.id);

      agenceIds.forEach((agenceId) => {
        const qAg = query(
          collection(
            db,
            "companies",
            user.companyId,
            "agences",
            agenceId,
            "reservations"
          ),
          where("statut", "==", "preuve_recue")
        );
        const unsub = onSnapshot(qAg, (snap) => {
          countsByAgence.set(agenceId, snap.size);
          const total = Array.from(countsByAgence.values()).reduce(
            (a, b) => a + b,
            0
          );
          setOnlineProofsCount(total);
        });
        unsubs.push(unsub);
      });
    })();

    return () => unsubs.forEach((u) => u());
  }, [user?.companyId]);

  /* ===== AVIS CLIENTS EN ATTENTE ===== */
  React.useEffect(() => {
    if (!user?.companyId) return;
    const qAvis = query(
      collection(db, "avis"),
      where("companyId", "==", user.companyId),
      where("visible", "==", false)
    );
    const unsub = onSnapshot(qAvis, (snap) =>
      setPendingReviewsCount(snap.size)
    );
    return () => unsub();
  }, [user?.companyId]);

  return (
    <PageHeaderProvider>
      <LayoutInner
        theme={theme}
        isActive={isActive}
        onlineProofsCount={onlineProofsCount}
        pendingReviewsCount={pendingReviewsCount}
        userInitial={
          user?.displayName?.charAt(0) ||
          user?.email?.charAt(0) ||
          "?"
        }
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

/* ================= LAYOUT INTERNE ================= */
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
}> = ({
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
}) => {
  const { header } = usePageHeader();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* ===== SIDEBAR DESKTOP ===== */}
      <aside
        className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col text-white shadow-xl z-40"
        style={{ backgroundColor: theme.colors.primary }}
      >
        <div className="flex-1 flex flex-col">
          {/* LOGO */}
          <div className="p-6 border-b border-white/20 flex items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="logo"
                className="h-10 w-10 rounded-full"
              />
            )}
            <h1 className="text-lg font-bold truncate">
              {companyName}
            </h1>
          </div>

          {/* NAVIGATION */}
          <nav className="flex-1 p-4 space-y-1">
            {NAV.map((item) => (
              <NavItem
                key={item.path}
                to={item.path}
                label={item.label}
                icon={<item.icon />}
                active={isActive(item.path)}
                theme={theme}
                badge={
                  item.path === "/compagnie/reservations"
                    ? onlineProofsCount
                    : item.path === "/compagnie/avis-clients"
                    ? pendingReviewsCount
                    : undefined
                }
              />
            ))}

            <div className="mt-6 pt-4 border-t border-white/20">
              <p className="text-xs uppercase opacity-80 px-3 mb-2">
                Analytique
              </p>
              {NAV_ANALYTICS.map((item) => (
                <NavItem
                  key={item.path}
                  to={item.path}
                  label={item.label}
                  icon={<item.icon />}
                  active={isActive(item.path)}
                  theme={theme}
                />
              ))}
            </div>
          </nav>

          {/* PROFIL */}
          <div className="p-4 border-t border-white/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-medium"
                  style={{ backgroundColor: theme.colors.secondary }}
                >
                  {userInitial}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {userName}
                  </p>
                  <p className="text-xs opacity-80">
                    {roleLabels[userRole ?? ""] ?? userRole}
                  </p>
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-2 rounded-md hover:bg-white/20"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== CONTENU ===== */}
      <main className="md:ml-64">
        <div className="h-screen flex flex-col">
          {/* HEADER MOBILE */}
          <header className="bg-white shadow-sm p-4 md:hidden flex justify-between">
            <button onClick={onOpenMobileMenu}>
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-semibold">{companyName}</h1>
            <div />
          </header>

          {/* HEADER DYNAMIQUE */}
          <div
            className="px-6 py-4 shadow-sm"
            style={{
              background: header.bg,
              color: header.fg || "#fff",
            }}
          >
            <div className="text-2xl font-bold">
              {header.title}
            </div>
            {header.subtitle && (
              <div className="text-sm opacity-90">
                {header.subtitle}
              </div>
            )}
          </div>

          {/* CONTENU */}
          <div className="flex-1 overflow-y-auto p-6">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
};

/* ================= NAV ITEM ================= */
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
    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition ${
      active ? "font-bold" : "opacity-90 hover:opacity-100"
    }`}
    style={{
      backgroundColor: active ? theme.colors.secondary : "transparent",
      color: active ? "#fff" : "#f1f1f1",
    }}
  >
    {icon}
    <span className="flex-1 text-sm">{label}</span>
    {typeof badge === "number" && badge > 0 && (
      <span className="bg-red-500 text-xs px-2 py-0.5 rounded-full">
        {badge}
      </span>
    )}
    <ChevronRight
      className={`w-4 h-4 ${
        active ? "opacity-100" : "opacity-0"
      }`}
    />
  </Link>
);

export default CompagnieLayout;
