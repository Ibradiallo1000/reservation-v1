// src/modules/agence/fleet/FleetLayout.tsx
// Phase 3: Dedicated layout for Fleet — aligned with Guichet/Manager (réseau, dark, F2).
import React from "react";
import { Navigate, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { LayoutDashboard, Truck, ClipboardList, History, MapPin } from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { useOnlineStatus, useAgencyDarkMode, useAgencyKeyboardShortcuts, AgencyHeaderExtras } from "@/modules/agence/shared";

const FLEET_SECTIONS: NavSection[] = [
  { label: "Tableau de bord", icon: LayoutDashboard, path: "/agence/fleet", end: true },
  { label: "Exploitation", icon: MapPin, path: "/agence/fleet/operations", end: true },
  { label: "Affectation", icon: ClipboardList, path: "/agence/fleet/assignment" },
  { label: "Véhicules", icon: Truck, path: "/agence/fleet/vehicles" },
  { label: "Mouvements", icon: History, path: "/agence/fleet/movements" },
];

const ALLOWED_FLEET_ROLES = ["agency_fleet_controller", "chefAgence", "admin_compagnie"] as const;

const FleetLayout: React.FC = () => {
  const { user, company, logout } = useAuth() as {
    user: { role?: string | string[]; displayName?: string; nom?: string; email?: string };
    company: unknown;
    logout: () => Promise<void>;
  };
  const navigate = useNavigate();
  const theme = useCompanyTheme(company);
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();
  useAgencyKeyboardShortcuts(FLEET_SECTIONS);

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);
  const canUseFleet = ALLOWED_FLEET_ROLES.some((r) => has(r));

  if (!canUseFleet) {
    if (has("chefEmbarquement")) return <Navigate to="/agence/boarding" replace />;
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
    <div className={darkMode ? "agency-dark" : ""}>
      <InternalLayout
        sections={FLEET_SECTIONS}
        role={rolesArr[0] || "agency_fleet_controller"}
        userName={user?.displayName ?? user?.nom}
        userEmail={user?.email}
        brandName={(company as { nom?: string })?.nom ?? "Flotte"}
        logoUrl={(company as { logoUrl?: string })?.logoUrl}
        primaryColor={theme?.colors?.primary}
        secondaryColor={theme?.colors?.secondary}
        onLogout={handleLogout}
        headerRight={
          <AgencyHeaderExtras isOnline={isOnline} darkMode={darkMode} onDarkModeToggle={toggleDarkMode} />
        }
        mainClassName="agency-content-transition"
      >
        <Outlet />
      </InternalLayout>
    </div>
  );
};

export default FleetLayout;
