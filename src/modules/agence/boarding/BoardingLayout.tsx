// src/modules/agence/boarding/BoardingLayout.tsx
// Phase 3: Dedicated layout for Boarding — aligned with Guichet/Manager (réseau, dark, F2).
import React, { useState, useEffect } from "react";
import { Navigate, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { LayoutDashboard, ClipboardCheck } from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import type { Company } from "@/types/companyTypes";
import { useOnlineStatus, useAgencyKeyboardShortcuts } from "@/modules/agence/shared";

const BOARDING_SECTIONS: NavSection[] = [
  { label: "Départs du jour", icon: LayoutDashboard, path: "/agence/boarding", end: true },
  { label: "Scan / Liste", icon: ClipboardCheck, path: "/agence/boarding/scan" },
];

const ALLOWED_BOARDING_ROLES = ["chefEmbarquement", "chefAgence", "admin_compagnie"] as const;

const BoardingLayout: React.FC = () => {
  const { user, company, logout } = useAuth() as { user: { role?: string | string[]; displayName?: string; nom?: string; email?: string }; company: unknown; logout: () => Promise<void> };
  const navigate = useNavigate();
  const theme = useCompanyTheme(company as Company | null);
  const isOnline = useOnlineStatus();
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    return (localStorage.getItem("theme") as "light" | "dark") || "light";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
    localStorage.setItem("theme", themeMode);
  }, [themeMode]);

  useAgencyKeyboardShortcuts(BOARDING_SECTIONS);

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);
  const canUseBoarding = ALLOWED_BOARDING_ROLES.some((r) => has(r));

  if (!canUseBoarding) {
    if (has("agency_fleet_controller")) return <Navigate to="/agence/fleet" replace />;
    if (has("chefAgence") || has("admin_compagnie")) return <Navigate to="/agence/dashboard" replace />;
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
    <div className={themeMode === "dark" ? "agency-dark" : ""}>
      <InternalLayout
        sections={BOARDING_SECTIONS}
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
            <button
              onClick={() => setThemeMode((prev) => (prev === "dark" ? "light" : "dark"))}
              className="ml-2 px-3 py-2 rounded-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-800 dark:text-white transition"
              title="Changer le thème"
            >
              {themeMode === "dark" ? "☀️" : "🌙"}
            </button>
          </>
        }
        mainClassName="agency-content-transition"
      >
        <Outlet />
      </InternalLayout>
    </div>
  );
};

export default BoardingLayout;
