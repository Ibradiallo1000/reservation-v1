// src/modules/agence/boarding/BoardingLayout.tsx
// Phase 3: Dedicated layout for Boarding — aligned with Guichet/Manager (réseau, dark, F2).
import React from "react";
import { Navigate, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { Company } from "@/types/companyTypes";
import { useOnlineStatus, useAgencyDarkMode, useAgencyKeyboardShortcuts } from "@/modules/agence/shared";
import { boardingNavigation } from "@/navigation/operations.navigation";
import { resolveNavigation, toNavSections } from "@/navigation/navigation.utils";

const ALLOWED_BOARDING_ROLES = [
  "chefEmbarquement",
  "chefAgence",
  "chefagence",
  "escale_agent",
  "escale_manager",
  "admin_compagnie",
] as const;

const BOARDING_THEME_STORAGE_KEY = "teliya:boarding-theme";

const BoardingLayout: React.FC = () => {
  const { user, company, logout } = useAuth() as { user: { role?: string | string[]; displayName?: string; nom?: string; email?: string }; company: unknown; logout: () => Promise<void> };
  const navigate = useNavigate();
  const theme = useCompanyTheme(company as Company | null);
  const isOnline = useOnlineStatus();
  const [darkMode] = useAgencyDarkMode(BOARDING_THEME_STORAGE_KEY);

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const sections = toNavSections(resolveNavigation(boardingNavigation, rolesArr));
  useAgencyKeyboardShortcuts(sections);
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);
  const canUseBoarding = ALLOWED_BOARDING_ROLES.some((r) => has(r));

  if (!canUseBoarding) {
    if (has("agency_fleet_controller")) return <Navigate to="/agence/fleet" replace />;
    if (has("chefAgence") || has("superviseur")) return <Navigate to="/agence/activite" replace />;
    if (has("admin_compagnie")) return <Navigate to="/agence/activite" replace />;
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={`${darkMode ? "agency-dark " : ""}min-h-screen bg-gray-50 dark:bg-slate-950`}>
      <InternalLayout
        sections={sections}
        role={rolesArr[0] || "chefEmbarquement"}
        userName={user?.displayName ?? user?.nom}
        userEmail={user?.email}
        brandName={(company as { nom?: string })?.nom ?? "Embarquement"}
        logoUrl={(company as { logoUrl?: string })?.logoUrl}
        primaryColor={theme?.colors?.primary}
        secondaryColor={theme?.colors?.secondary}
        onLogout={handleLogout}
        headerRight={
          <>
            {!isOnline && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold mr-2"
                title="Connexion perdue"
              >
                <span className="hidden sm:inline">Hors-ligne</span>
              </div>
            )}
          </>
        }
        mainClassName="agency-content-transition"
        hideTabsOnMobile
        forceSidebar
        themeStorageKey={BOARDING_THEME_STORAGE_KEY}
        binaryThemeToggle
      >
        <Outlet />
      </InternalLayout>
    </div>
  );
};

export default BoardingLayout;
