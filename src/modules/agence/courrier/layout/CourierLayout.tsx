// src/modules/agence/courrier/layout/CourierLayout.tsx
// Phase 1: Courrier sous-domaine Agence (comme Guichet, Embarquement, Flotte).

import React, { useState, useEffect, useMemo } from "react";
import { Navigate, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { lightenForDarkMode } from "@/utils/color";
import { Package, LayoutDashboard, PlusCircle, Inbox, Truck, FileText, Layers } from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import type { Company } from "@/types/companyTypes";
import { useOnlineStatus, useAgencyKeyboardShortcuts } from "@/modules/agence/shared";

const COURRIER_SECTIONS: NavSection[] = [
  { label: "Courrier", icon: LayoutDashboard, path: "/agence/courrier", end: true },
  { label: "Nouvel envoi", icon: PlusCircle, path: "/agence/courrier/nouveau" },
  { label: "Lots", icon: Layers, path: "/agence/courrier/lots" },
  { label: "Réception", icon: Inbox, path: "/agence/courrier/reception" },
  { label: "Remise", icon: Truck, path: "/agence/courrier/remise" },
  { label: "Rapport", icon: FileText, path: "/agence/courrier/rapport" },
];

const ALLOWED_COURRIER_ROLES = ["agentCourrier", "chefAgence", "admin_compagnie"] as const;

const CourierLayout: React.FC = () => {
  const { user, company, logout } = useAuth() as {
    user: { role?: string | string[]; displayName?: string; nom?: string; email?: string };
    company: unknown;
    logout: () => Promise<void>;
  };
  const navigate = useNavigate();
  const theme = useCompanyTheme(company as Company | null);
  const isOnline = useOnlineStatus();
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() =>
    (localStorage.getItem("theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
    localStorage.setItem("theme", themeMode);
  }, [themeMode]);

  useAgencyKeyboardShortcuts(COURRIER_SECTIONS);

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);
  const canUseCourrier = ALLOWED_COURRIER_ROLES.some((r) => has(r));

  if (!canUseCourrier) {
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

  const companyName = (company as { nom?: string })?.nom ?? "Courrier";
  const agencyName = (user as { agencyNom?: string; agencyName?: string })?.agencyNom ?? (user as { agencyName?: string })?.agencyName ?? "Agence";

  const primary = (theme?.colors?.primary ?? "#ea580c").trim();
  const secondary = (theme?.colors?.secondary ?? "#f97316").trim();
  const cssVars = useMemo(() => {
    if (themeMode === "dark") {
      const p = lightenForDarkMode(primary);
      const s = lightenForDarkMode(secondary);
      return {
        "--courier-primary": p,
        "--courier-secondary": s,
        "--teliya-primary": p,
        "--teliya-secondary": s,
      } as React.CSSProperties;
    }
    return {
      "--courier-primary": primary,
      "--courier-secondary": secondary,
      "--teliya-primary": primary,
      "--teliya-secondary": secondary,
    } as React.CSSProperties;
  }, [themeMode, primary, secondary]);

  return (
    <div className={themeMode === "dark" ? "agency-dark" : ""} style={cssVars}>
      <InternalLayout
        sections={COURRIER_SECTIONS}
        role={rolesArr[0] || "agentCourrier"}
        userName={user?.displayName ?? user?.nom}
        userEmail={user?.email}
        brandName={companyName}
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

export default CourierLayout;
