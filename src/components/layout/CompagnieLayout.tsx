// src/components/layout/CompagnieLayout.tsx (version corrigée complète)
import React from "react";
import { Outlet, Link, useLocation, useParams } from "react-router-dom";
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
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import {
  PageHeaderProvider,
  usePageHeader,
} from "@/contexts/PageHeaderContext";

// Définir l'interface Company
interface Company {
  id: string;
  nom: string;
  slug: string;
  logoUrl?: string;
  [key: string]: any;
}

/* ================= RÔLES ================= */
const roleLabels: Record<string, string> = {
  admin_compagnie: "CEO",
  admin_platforme: "Admin Plateforme",
  chefAgence: "Chef d'agence",
  comptable: "Comptable",
  superviseur: "Superviseur",
  guichetier: "Guichetier",
  compagnie: "Compte Compagnie",
};

/* ================= NAVIGATION (DONNÉES) ================= */
const getNavItems = (companyId?: string) => {
  const basePath = companyId ? `/compagnie/${companyId}` : "/compagnie";
  
  return [
    {
      label: "Tableau de bord",
      path: `${basePath}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      label: "Réservations",
      path: `${basePath}/reservations`,
      icon: ClipboardList,
    },
    {
      label: "Agences",
      path: `${basePath}/agences`,
      icon: Building,
    },
    {
      label: "Avis clients",
      path: `${basePath}/avis-clients`,
      icon: MessageSquare,
    },
    {
      label: "Configuration",
      path: `${basePath}/parametres`,
      icon: Settings,
    },
  ];
};

const getNavAnalytics = (companyId?: string) => {
  const basePath = companyId ? `/compagnie/${companyId}` : "/compagnie";
  
  return [
    {
      label: "Médias",
      path: `${basePath}/images`,
      icon: ImageIcon,
    },
    {
      label: "Comptabilité",
      path: `${basePath}/comptabilite`,
      icon: BarChart2,
    },
  ];
};

/* ================= COMPONENT: MODE BADGE ================= */
const ModeBadge: React.FC<{ isImpersonationMode: boolean }> = ({ isImpersonationMode }) => {
  if (!isImpersonationMode) return null;
  
  return (
    <div className="absolute -top-1 -right-1">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
      </span>
    </div>
  );
};

/* ================= LAYOUT PRINCIPAL ================= */
const CompagnieLayout: React.FC = () => {
  const location = useLocation();
  const params = useParams();
  const { user, logout, company, loading } = useAuth();
  
  // Récupérer le companyId depuis l'URL ou depuis l'utilisateur
  const urlCompanyId = params.companyId;
  const userCompanyId = user?.companyId;
  const currentCompanyId = urlCompanyId || userCompanyId;
  
  // Mode impersonation : admin plateforme regardant une autre compagnie
  const isImpersonationMode = Boolean(user?.role === "admin_platforme" && urlCompanyId);
  
  const [currentCompany, setCurrentCompany] = React.useState<Company | null>(company);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  
  // Charger la compagnie depuis l'URL si en mode impersonation
  React.useEffect(() => {
    if (!urlCompanyId || urlCompanyId === userCompanyId) {
      setCurrentCompany(company);
      return;
    }
    
    // Charger la compagnie depuis Firestore
    const loadCompanyFromUrl = async () => {
      try {
        const companyDoc = await getDoc(doc(db, "companies", urlCompanyId));
        if (companyDoc.exists()) {
          const data = companyDoc.data();
          setCurrentCompany({ 
            id: companyDoc.id, 
            nom: data.nom || "",
            slug: data.slug || "",
            logoUrl: data.logoUrl,
            ...data 
          });
        }
      } catch (error) {
        console.error("Erreur lors du chargement de la compagnie:", error);
      }
    };
    
    loadCompanyFromUrl();
  }, [urlCompanyId, userCompanyId, company]);

  const theme = useCompanyTheme(currentCompany);
  
  // Navigation dynamique basée sur le companyId
  const NAV = getNavItems(urlCompanyId);
  const NAV_ANALYTICS = getNavAnalytics(urlCompanyId);

  const isActive = (path: string) =>
    location.pathname === path ||
    location.pathname.startsWith(path + "/");

  /* ===== BADGES ===== */
  const [onlineProofsCount, setOnlineProofsCount] = React.useState(0);
  const [pendingReviewsCount, setPendingReviewsCount] = React.useState(0);

  /* ===== RÉSERVATIONS EN ATTENTE (PREUVES) ===== */
  React.useEffect(() => {
    if (!currentCompanyId) return;
    let unsubs: Array<() => void> = [];
    const countsByAgence = new Map<string, number>();

    (async () => {
      const agencesSnap = await getDocs(
        collection(db, "companies", currentCompanyId, "agences")
      );
      const agenceIds = agencesSnap.docs.map((d) => d.id);

      agenceIds.forEach((agenceId) => {
        const qAg = query(
          collection(
            db,
            "companies",
            currentCompanyId,
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
  }, [currentCompanyId]);

  /* ===== AVIS CLIENTS EN ATTENTE ===== */
  React.useEffect(() => {
    if (!currentCompanyId) return;
    const qAvis = query(
      collection(db, "companies", currentCompanyId, "avis"),
      where("visible", "==", false)
    );

    const unsub = onSnapshot(qAvis, (snap) =>
      setPendingReviewsCount(snap.size)
    );
    return () => unsub();
  }, [currentCompanyId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement de l'espace compagnie...</p>
        </div>
      </div>
    );
  }

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
        companyName={currentCompany?.nom || "Compagnie"}
        logoUrl={currentCompany?.logoUrl}
        isImpersonationMode={isImpersonationMode}
        navItems={NAV}
        navAnalytics={NAV_ANALYTICS}
        onLogout={logout}
        onExitImpersonation={() => window.location.href = "/admin/compagnies"}
        onOpenMobileMenu={() => setMobileMenuOpen(true)}
      />
    </PageHeaderProvider>
  );
};

/* ================= LAYOUT INTERNE ================= */
interface LayoutInnerProps {
  theme: any;
  isActive: (p: string) => boolean;
  onlineProofsCount: number;
  pendingReviewsCount: number;
  userInitial: string;
  userName: string;
  userRole?: string;
  companyName: string;
  logoUrl?: string;
  isImpersonationMode: boolean;
  navItems: any[];
  navAnalytics: any[];
  onLogout: () => void;
  onExitImpersonation: () => void;
  onOpenMobileMenu: () => void;
}

const LayoutInner: React.FC<LayoutInnerProps> = ({
  theme,
  isActive,
  onlineProofsCount,
  pendingReviewsCount,
  userInitial,
  userName,
  userRole,
  companyName,
  logoUrl,
  isImpersonationMode,
  navItems,
  navAnalytics,
  onLogout,
  onExitImpersonation,
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
          {/* LOGO avec badge mode impersonation */}
          <div className="p-6 border-b border-white/20 flex items-center gap-3 relative">
            <div className="relative">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="logo"
                  className="h-10 w-10 rounded-full"
                />
              )}
              <ModeBadge isImpersonationMode={isImpersonationMode} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">
                {companyName}
              </h1>
              {isImpersonationMode && (
                <p className="text-xs opacity-80 text-yellow-200">
                  Mode inspection
                </p>
              )}
            </div>
          </div>

          {/* NAVIGATION */}
          <nav className="flex-1 p-4 space-y-1">
            {navItems.map((item) => (
              <NavItem
                key={item.path}
                to={item.path}
                label={item.label}
                icon={<item.icon />}
                active={isActive(item.path)}
                theme={theme}
                badge={
                  item.path.includes("/reservations")
                    ? onlineProofsCount
                    : item.path.includes("/avis-clients")
                    ? pendingReviewsCount
                    : undefined
                }
              />
            ))}

            <div className="mt-6 pt-4 border-t border-white/20">
              <p className="text-xs uppercase opacity-80 px-3 mb-2">
                Analytique
              </p>
              {navAnalytics.map((item) => (
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
                <div className="relative">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center font-medium"
                    style={{ backgroundColor: theme.colors.secondary }}
                  >
                    {userInitial}
                  </div>
                  <ModeBadge isImpersonationMode={isImpersonationMode} />
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
              <div className="flex items-center gap-1">
                {isImpersonationMode && (
                  <button
                    onClick={onExitImpersonation}
                    className="p-2 rounded-md hover:bg-white/20 text-yellow-300"
                    title="Quitter le mode inspection"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={onLogout}
                  className="p-2 rounded-md hover:bg-white/20"
                  title="Se déconnecter"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* ===== CONTENU ===== */}
      <main className="md:ml-64">
        <div className="h-screen flex flex-col">
          {/* HEADER MOBILE */}
          <header className="bg-white shadow-sm p-4 md:hidden flex justify-between items-center">
            <button onClick={onOpenMobileMenu}>
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-center">
              <h1 className="font-semibold">{companyName}</h1>
              {isImpersonationMode && (
                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                  Mode inspection
                </span>
              )}
            </div>
            <div className="w-5" /> {/* Spacer pour centrer */}
          </header>

          {/* BANNER MODE IMPERSONATION */}
          {isImpersonationMode && (
            <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-800">
                    🔍 Vous êtes en mode inspection de <strong>{companyName}</strong>
                  </span>
                </div>
                <button
                  onClick={onExitImpersonation}
                  className="text-sm bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700"
                >
                  Retour à l'admin
                </button>
              </div>
            </div>
          )}

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