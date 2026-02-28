import React, { useMemo } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { lightenForDarkMode } from "@/utils/color";
import {
  LayoutDashboard,
  Activity,
  Banknote,
  Users,
  FileBarChart2,
  MapPinned,
  Wallet,
  Package,
} from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection, NavSectionChild } from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import { SubscriptionBanner } from "@/shared/subscription";
import type { SubscriptionStatus } from "@/shared/subscription";
import { Timestamp } from "firebase/firestore";
import { DateFilterProvider } from "./DateFilterContext";
import { useManagerAlerts } from "./useManagerAlerts";
import { NotificationBell } from "./ui";
import {
  useOnlineStatus,
  useAgencyDarkMode,
  useAgencyKeyboardShortcuts,
  AgencyHeaderExtras,
} from "@/modules/agence/shared";

const COURRIER_CHILDREN: NavSectionChild[] = [
  { label: "Vue générale", path: "/agence/courrier", end: true },
  { label: "Nouvel envoi", path: "/agence/courrier/nouveau" },
  { label: "Lots", path: "/agence/courrier/lots" },
  { label: "Réception", path: "/agence/courrier/reception" },
  { label: "Remise", path: "/agence/courrier/remise" },
  { label: "Rapports courrier", path: "/agence/courrier/rapport" },
];

const BASE_SECTIONS: Array<NavSection & { moduleKey: string }> = [
  { label: "Dashboard",   icon: LayoutDashboard, path: "/agence/dashboard",   end: true, moduleKey: "dashboard" },
  { label: "Opérations",  icon: Activity,        path: "/agence/operations",             moduleKey: "operations" },
  { label: "Trajets",     icon: MapPinned,       path: "/agence/trajets",                moduleKey: "trajets" },
  { label: "Finances",    icon: Banknote,        path: "/agence/finances",               moduleKey: "finances" },
  { label: "Trésorerie",  icon: Wallet,          path: "/agence/treasury",               moduleKey: "treasury" },
  { label: "Équipe",      icon: Users,           path: "/agence/team",                   moduleKey: "team" },
  { label: "Rapports",    icon: FileBarChart2,   path: "/agence/reports",                moduleKey: "reports" },
];

const ManagerShellInner: React.FC = () => {
  const { user, company, logout } = useAuth() as any;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useCompanyTheme(company);
  const { alerts, totalAlertCount, badgeByModule } = useManagerAlerts();
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);

  const sections: NavSection[] = useMemo(() => {
    const list: NavSection[] = BASE_SECTIONS.map((s) => ({
      label: s.label,
      icon: s.icon,
      path: s.path,
      end: s.end,
      badge: badgeByModule[s.moduleKey as keyof typeof badgeByModule] || undefined,
    }));
    if (has("chefAgence") || has("admin_compagnie") || has("agentCourrier")) {
      list.push({
        label: "Courrier",
        icon: Package,
        path: "/agence/courrier",
        end: false,
        badge: (badgeByModule as Record<string, number>).courrier,
        children: COURRIER_CHILDREN,
      });
    }
    return list;
  }, [badgeByModule, rolesArr]);

  useAgencyKeyboardShortcuts(sections);

  const canUseShell = has("chefAgence") || has("superviseur") || has("admin_compagnie") || has("agentCourrier");

  if (has("agentCourrier") && !pathname.startsWith("/agence/courrier")) {
    return <Navigate to="/agence/courrier" replace />;
  }
  if (!canUseShell) {
    if (has("chefEmbarquement")) return <Navigate to="/agence/boarding" replace />;
    if (has("agency_fleet_controller")) return <Navigate to="/agence/fleet" replace />;
    if (has("guichetier")) return <Navigate to="/agence/guichet" replace />;
    if (has("agency_accountant")) return <Navigate to="/agence/comptabilite" replace />;
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try { await logout(); navigate("/login"); } catch (e) { console.error(e); }
  };

  const subStatus = company?.subscriptionStatus as SubscriptionStatus | undefined;
  const trialEndsAtRaw = company?.trialEndsAt;
  const trialEndsAt = trialEndsAtRaw instanceof Timestamp
    ? trialEndsAtRaw.toDate()
    : trialEndsAtRaw instanceof Date ? trialEndsAtRaw : null;

  const companyName = company?.nom || "Compagnie";
  const agencyName = user?.agencyNom || user?.agencyName || "Agence";
  const primary = (theme?.colors?.primary ?? "#FF6600").trim();
  const secondary = (theme?.colors?.secondary ?? "#FFFFFF").trim();
  const cssVars = useMemo(() => {
    if (darkMode) {
      return {
        "--teliya-primary": lightenForDarkMode(primary),
        "--teliya-secondary": lightenForDarkMode(secondary),
      } as React.CSSProperties;
    }
    return {
      "--teliya-primary": primary,
      "--teliya-secondary": secondary,
    } as React.CSSProperties;
  }, [darkMode, primary, secondary]);

  return (
    <div className={darkMode ? "agency-dark" : ""} style={cssVars}>
    <InternalLayout
      sections={sections}
      role={rolesArr[0] || "chefAgence"}
      userName={user?.displayName || undefined}
      userEmail={user?.email || undefined}
      brandName={companyName}
      logoUrl={company?.logoUrl}
      primaryColor={theme?.colors?.primary}
      secondaryColor={theme?.colors?.secondary}
      onLogout={handleLogout}
      headerLeft={
        <div className="hidden sm:flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold text-gray-900 truncate">{companyName}</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-600 truncate">{agencyName}</span>
          <span className="text-gray-300">/</span>
          <span className="text-gray-500">Chef d&apos;agence</span>
        </div>
      }
      headerRight={
        <>
          <NotificationBell alerts={alerts} totalCount={totalAlertCount} />
          <AgencyHeaderExtras
            isOnline={isOnline}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
          />
        </>
      }
      mainClassName="agency-content-transition"
      banner={null}
    />
    </div>
  );
};

const ManagerShellPage: React.FC = () => {
  const { company } = useAuth() as any;
  return (
    <CurrencyProvider currency={company?.devise}>
      <DateFilterProvider>
        <ManagerShellInner />
      </DateFilterProvider>
    </CurrencyProvider>
  );
};

export default ManagerShellPage;
