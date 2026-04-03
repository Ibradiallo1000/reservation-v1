import React, { useMemo, useState, useEffect } from "react";
import { Navigate, Outlet, useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { lightenForDarkMode } from "@/utils/color";
import {
  Activity,
  Banknote,
  Users,
  FileBarChart2,
  MapPinned,
  Boxes,
  CalendarRange,
  ClipboardCheck,
} from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection, NavSectionChild } from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
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

const courierChildren = (includeCourier: boolean): NavSectionChild[] =>
  includeCourier
    ? [
        { label: "Courrier — session", path: "/agence/courrier/session", end: true },
        { label: "Courrier — nouvel envoi", path: "/agence/courrier/nouveau", end: true },
        { label: "Courrier — arrivages", path: "/agence/courrier/arrivages", end: true },
        { label: "Courrier — remise", path: "/agence/courrier/remise", end: true },
      ]
    : [];

/** Admin / CEO en contexte agence : embarquement + flotte complète + courrier optionnel. */
function buildFullOpsChildren(includeCourier: boolean): NavSectionChild[] {
  return [
    { label: "Embarquement", path: "/agence/boarding", end: true },
    { label: "Flotte — tableau de bord", path: "/agence/fleet", end: true },
    { label: "Flotte — exploitation", path: "/agence/fleet/operations", end: true },
    { label: "Flotte — affectation", path: "/agence/fleet/assignment" },
    { label: "Flotte — véhicules", path: "/agence/fleet/vehicles" },
    { label: "Flotte — équipage", path: "/agence/fleet/crew" },
    { label: "Flotte — mouvements", path: "/agence/fleet/movements" },
    ...courierChildren(includeCourier),
  ];
}

/** Contrôleur flotte : menus flotte (la planification est une entrée principale du shell). */
function buildFleetOpsChildren(includeCourier: boolean): NavSectionChild[] {
  return [
    { label: "Flotte — tableau de bord", path: "/agence/fleet", end: true },
    { label: "Flotte — exploitation", path: "/agence/fleet/operations", end: true },
    { label: "Flotte — affectation", path: "/agence/fleet/assignment" },
    { label: "Flotte — véhicules", path: "/agence/fleet/vehicles" },
    { label: "Flotte — équipage", path: "/agence/fleet/crew" },
    { label: "Flotte — mouvements", path: "/agence/fleet/movements" },
    ...courierChildren(includeCourier),
  ];
}

/** 5 domaines principaux + entrée « Modules » (secondaire). */
const BASE_SECTIONS: Array<
  NavSection & { moduleKey: string; activityBadge?: boolean; caisseBadge?: boolean }
> = [
  {
    label: "Activité",
    icon: Activity,
    path: "/agence/activite",
    end: true,
    moduleKey: "dashboard",
    activityBadge: true,
  },
  {
    label: "Caisse",
    icon: Banknote,
    path: "/agence/caisse",
    end: true,
    moduleKey: "finances",
    caisseBadge: true,
  },
  { label: "Équipe", icon: Users, path: "/agence/team", end: true, moduleKey: "team" },
  { label: "Trajets", icon: MapPinned, path: "/agence/trajets", end: true, moduleKey: "trajets" },
  {
    label: "Planification",
    icon: CalendarRange,
    path: "/agence/planification-trajets",
    end: true,
    moduleKey: "planning",
  },
  {
    label: "Validation départs",
    icon: ClipboardCheck,
    path: "/agence/validation-departs",
    end: true,
    moduleKey: "validations",
  },
  {
    label: "Arrivées attendues",
    icon: MapPinned,
    path: "/agence/arrivees-attendues",
    end: true,
    moduleKey: "arrivals",
  },
  { label: "Rapports", icon: FileBarChart2, path: "/agence/reports", end: true, moduleKey: "reports" },
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
    Activité: 1,
    Caisse: 2,
    Équipe: 3,
    Trajets: 4,
    Planification: 5,
    "Validation départs": 6,
    "Arrivées attendues": 7,
    Rapports: 8,
    "Journal agents": 8,
    Courrier: 8,
    Exploitation: 8,
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
        { label: "Retour tableau de bord escale", icon: Activity, path: "/agence/escale", end: true },
      ];
    }
    const isCourierOnly = has("agentCourrier") && !has("chefAgence") && !has("superviseur") && !has("admin_compagnie");
    const canValidateAgencyExpenses = has("chefAgence") || has("superviseur") || has("admin_compagnie");
    const list: NavSection[] = isCourierOnly
      ? [
          { label: "Courrier", icon: Boxes, path: "/agence/courrier/session", end: true },
          { label: "Nouvel envoi", icon: Boxes, path: "/agence/courrier/nouveau", end: true },
          { label: "Arrivages", icon: Boxes, path: "/agence/courrier/arrivages", end: true },
          { label: "Remise", icon: Boxes, path: "/agence/courrier/remise", end: true },
        ]
      : BASE_SECTIONS.map((s) => {
          if (s.label === "Validation départs" && !has("chefAgence") && !has("chefagence")) {
            return null;
          }
          if (s.label === "Arrivées attendues" && !has("chefAgence") && !has("chefagence")) {
            return null;
          }
          const opBadge = (badgeByModule as Record<string, number>).operations ?? 0;
          const finBadge = (badgeByModule as Record<string, number>).finances ?? 0;
          let badge: number | undefined;
          if (s.activityBadge) {
            const n = (badgeByModule.dashboard ?? 0) + opBadge;
            badge = n > 0 ? n : undefined;
          } else if (s.caisseBadge) {
            const n = finBadge + (canValidateAgencyExpenses ? pendingManagerExpensesCount : 0);
            badge = n > 0 ? n : undefined;
          } else {
            badge = badgeByModule[s.moduleKey as keyof typeof badgeByModule] || undefined;
          }
          return {
            label: s.label,
            icon: s.icon,
            path: s.path,
            end: s.end,
            badge,
          };
        }).filter(Boolean) as NavSection[];

    if (
      !isCourierOnly &&
      (has("chefAgence") || has("superviseur") || has("admin_compagnie") || has("agency_fleet_controller"))
    ) {
      const includeCourier = has("agentCourrier");
      if (has("admin_compagnie")) {
        list.push({
          label: "Exploitation",
          icon: Boxes,
          path: "/agence/boarding",
          end: false,
          children: buildFullOpsChildren(includeCourier),
        });
      } else if (has("chefAgence") || has("superviseur")) {
        if (includeCourier) {
          list.push({
            label: "Courrier",
            icon: Boxes,
            path: "/agence/courrier/session",
            end: false,
            children: courierChildren(true),
          });
        }
      } else if (has("agency_fleet_controller")) {
        list.push({
          label: "Exploitation",
          icon: Boxes,
          path: "/agence/fleet",
          end: false,
          children: buildFleetOpsChildren(includeCourier),
        });
      }
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

  if (pathname.startsWith("/agence/courrier")) {
    return (
      <div className={darkMode ? "agency-dark" : ""} style={cssVars}>
        <Outlet />
      </div>
    );
  }

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
            {agencyName}
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
