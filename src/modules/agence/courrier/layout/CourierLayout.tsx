// CourierLayout — Wrapper when Courrier is nested under Agence shell.
// No internal sidebar; main sidebar is the Agence ManagerShell.
// Applies courier theme vars and renders child route outlet.
import React, { useMemo } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { lightenForDarkMode } from "@/utils/color";
import type { Company } from "@/types/companyTypes";

const ALLOWED_COURRIER_ROLES = ["agentCourrier", "chefAgence", "admin_compagnie"] as const;

const CourierLayout: React.FC = () => {
  const { user, company } = useAuth() as {
    user: { role?: string | string[] };
    company: unknown;
  };
  const theme = useCompanyTheme(company as Company | null);
  const themeMode: "light" | "dark" =
    (document.documentElement.classList.contains("dark") ? "dark" : null) ??
    (localStorage.getItem("theme") as "light" | "dark") ??
    "light";

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const has = (r: string) => rolesArr.includes(r);
  const canUseCourrier = ALLOWED_COURRIER_ROLES.some((r) => has(r));

  if (!canUseCourrier) {
    return null;
  }

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
      <Outlet />
    </div>
  );
};

export default CourierLayout;
