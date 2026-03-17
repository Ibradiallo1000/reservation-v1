import React, { useMemo, useState, useEffect } from "react";
import { Navigate, useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
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
  Receipt,
  Truck,
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
import { listExpenses } from "@/modules/compagnie/treasury/expenses";
import {
  useOnlineStatus,
  useAgencyDarkMode,
  useAgencyKeyboardShortcuts,
  AgencyHeaderExtras,
} from "@/modules/agence/shared";

const COURRIER_CHILDREN: NavSectionChild[] = [
  { label: "Session", path: "/agence/courrier/session" },
  { label: "Nouvel envoi", path: "/agence/courrier/nouveau" },
  { label: "Lots", path: "/agence/courrier/lots" },
  { label: "Réception", path: "/agence/courrier/reception" },
  { label: "Remise", path: "/agence/courrier/remise" },
  { label: "Rapports courrier", path: "/agence/courrier/rapport" },
];

const TREASURY_CHILDREN: NavSectionChild[] = [
  { label: "Vue générale", path: "/agence/treasury", end: true },
  { label: "Soumettre dépense", path: "/agence/treasury/new-operation" },
  { label: "Versement compagnie", path: "/agence/treasury/transfer" },
  { label: "Nouveau payable fournisseur", path: "/agence/treasury/new-payable" },
];

const FLEET_CHILDREN: NavSectionChild[] = [
  { label: "Tableau de bord", path: "/agence/fleet", end: true },
  { label: "Exploitation", path: "/agence/fleet/operations", end: true },
  { label: "Affectation", path: "/agence/fleet/assignment" },
  { label: "Véhicules", path: "/agence/fleet/vehicles" },
  { label: "Équipage", path: "/agence/fleet/crew" },
  { label: "Mouvements", path: "/agence/fleet/movements" },
];

const BASE_SECTIONS: Array<NavSection & { moduleKey: string }> = [
  { label: "Poste de pilotage", icon: LayoutDashboard, path: "/agence/dashboard", end: true, moduleKey: "dashboard" },
  { label: "Opérations", icon: Activity, path: "/agence/operations", moduleKey: "operations" },
  { label: "Finances", icon: Banknote, path: "/agence/finances", moduleKey: "finances" },
  { label: "Trésorerie", icon: Wallet, path: "/agence/treasury", moduleKey: "treasury", children: TREASURY_CHILDREN },
  { label: "Rapports", icon: FileBarChart2, path: "/agence/reports", moduleKey: "reports" },
  { label: "Trajets", icon: MapPinned, path: "/agence/trajets", moduleKey: "trajets" },
  { label: "Équipe", icon: Users, path: "/agence/team", moduleKey: "team" },
];

const ManagerShellInner: React.FC = () => {
  const { user, company, logout } = useAuth() as any;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const theme = useCompanyTheme(company);
  const { alerts, totalAlertCount, badgeByModule, dismissAlert, markAllAlertsRead } = useManagerAlerts();
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();
  const [pendingManagerExpensesCount, setPendingManagerExpensesCount] = React.useState(0);
  const sectionOrder: Record<string, number> = {
    "Poste de pilotage": 1,
    "Opérations": 2,
    "Finances": 3,
    "Trésorerie": 4,
    "Validation dépenses": 5,
    "Courrier": 6,
    "Rapports": 7,
    "Trajets": 8,
    "Flotte": 9,
    "Équipe": 10,
  };

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  React.useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const list = await listExpenses(companyId, {
          agencyId,
          statusIn: ["pending_manager"],
          limitCount: 200,
        });
        if (!cancelled) setPendingManagerExpensesCount(list.length);
      } catch (_) {
        if (!cancelled) setPendingManagerExpensesCount(0);
      }
    };

    void load();
    const interval = setInterval(() => void load(), 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [companyId, agencyId]);

  const sections: NavSection[] = useMemo(() => {
    const isEscaleOnly = (has("escale_agent") || has("escale_manager")) && !has("chefAgence") && !has("admin_compagnie");
    if (isEscaleOnly) {
      return [
        { label: "Équipe", icon: Users, path: "/agence/team", end: true },
        { label: "Retour tableau de bord escale", icon: LayoutDashboard, path: "/agence/escale", end: true },
      ];
    }
    const isCourierOnly = has("agentCourrier") && !has("chefAgence") && !has("superviseur") && !has("admin_compagnie");
    const list: NavSection[] = isCourierOnly
      ? [
          { label: "Session", icon: Package, path: "/agence/courrier/session", end: true },
          { label: "Nouvel envoi", icon: Package, path: "/agence/courrier/nouveau", end: true },
          { label: "Lots", icon: Package, path: "/agence/courrier/lots", end: true },
          { label: "Réception", icon: Package, path: "/agence/courrier/reception", end: true },
          { label: "Remise", icon: Package, path: "/agence/courrier/remise", end: true },
          { label: "Rapports courrier", icon: Package, path: "/agence/courrier/rapport", end: true },
        ]
      : BASE_SECTIONS.map((s) => ({
          label: s.label,
          icon: s.icon,
          path: s.path,
          end: s.end,
          badge: badgeByModule[s.moduleKey as keyof typeof badgeByModule] || undefined,
        }));
    if (has("chefAgence") || has("superviseur") || has("admin_compagnie")) {
      list.push({
        label: "Validation dépenses",
        icon: Receipt,
        path: "/agence/expenses-approval",
        badge: pendingManagerExpensesCount || undefined,
      });
    }
    if (!isCourierOnly && has("agentCourrier")) {
      list.push({
        label: "Courrier",
        icon: Package,
        path: "/agence/courrier",
        end: false,
        badge: (badgeByModule as Record<string, number>).courrier,
        children: COURRIER_CHILDREN,
      });
    }
    if (has("chefAgence") || has("admin_compagnie") || has("agency_fleet_controller")) {
      list.push({
        label: "Flotte",
        icon: Truck,
        path: "/agence/fleet",
        end: false,
        children: FLEET_CHILDREN,
      });
    }
    return isCourierOnly ? list : list.sort((a, b) => (sectionOrder[a.label] ?? 99) - (sectionOrder[b.label] ?? 99));
  }, [badgeByModule, rolesArr, pendingManagerExpensesCount]);

  useAgencyKeyboardShortcuts(sections);

  const canUseShell = has("chefAgence") || has("superviseur") || has("admin_compagnie") || has("agentCourrier") || has("escale_agent") || has("escale_manager") || has("agency_fleet_controller");

  if (has("agentCourrier") && !pathname.startsWith("/agence/courrier")) {
    return <Navigate to="/agence/courrier" replace />;
  }
  if (has("escale_agent") || has("escale_manager")) {
    if (pathname === "/agence" || pathname === "/agence/") {
      return <Navigate to="/agence/team" replace />;
    }
    if (!pathname.startsWith("/agence/team")) {
      return <Navigate to="/agence/escale" replace />;
    }
  }
  if (!canUseShell) {
    if (has("chefEmbarquement")) return <Navigate to="/agence/boarding" replace />;
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
  const [agencyNameFromDb, setAgencyNameFromDb] = useState<string>("");

  useEffect(() => {
    if (!companyId || !agencyId) {
      setAgencyNameFromDb("");
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "companies", companyId, "agences", agencyId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const name = (data?.name ?? data?.nom ?? data?.nomAgence ?? user?.agencyName ?? user?.agencyNom ?? "Agence") as string;
        if (!cancelled) setAgencyNameFromDb(name || "Agence");
      })
      .catch(() => {
        if (!cancelled) setAgencyNameFromDb(user?.agencyNom ?? user?.agencyName ?? "Agence");
      });
    return () => { cancelled = true; };
  }, [companyId, agencyId, user?.agencyName, user?.agencyNom]);

  const agencyName = agencyNameFromDb || user?.agencyNom || user?.agencyName || "Agence";
  const roleLabel = has("escale_manager") ? "Chef d'escale" : has("escale_agent") ? "Agent escale"
    : has("agentCourrier") && !has("chefAgence") && !has("superviseur") && !has("admin_compagnie")
    ? "Agent courrier"
    : "Chef d'agence";
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
      brandSubtitle={agencyName ? `Agence : ${agencyName}` : undefined}
      logoUrl={company?.logoUrl}
      primaryColor={theme?.colors?.primary}
      secondaryColor={theme?.colors?.secondary}
      onLogout={handleLogout}
      headerLeft={
        <div className="hidden sm:flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold text-gray-900 dark:text-white truncate">
            Opérations — {agencyName}
          </span>
        </div>
      }
      headerRight={
        <>
          <NotificationBell
            alerts={alerts}
            totalCount={totalAlertCount}
            onAlertRead={dismissAlert}
            onMarkAllRead={markAllAlertsRead}
          />
          <AgencyHeaderExtras
            isOnline={isOnline}
            darkMode={darkMode}
            onDarkModeToggle={toggleDarkMode}
            showThemeToggle={false}
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
