import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Role } from "@/roles-permissions";

/* =========================
   Types
========================= */
interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles: readonly Role[];
}

/* =========================
   Utils
========================= */
const CANONICAL_ROLES: ReadonlySet<string> = new Set([
  "admin_platforme",
  "admin_compagnie",
  "company_accountant",
  "operator_digital",
  "agency_accountant",
  "responsable_logistique",
  "chef_garage",
  "chefagence",
  "chefembarquement",
  "superviseur",
  "agentcourrier",
  "guichetier",
  "agency_fleet_controller",
  "financial_director",
  "escale_agent",
  "escale_manager",
]);

const normalizeRole = (r?: unknown): Role => {
  if (!r) return "unauthenticated";
  const raw = String(r).trim().toLowerCase();
  if (raw === "company_ceo") return "admin_compagnie";
  if (raw === "chef_garage" || raw === "chefgarage") return "responsable_logistique";
  if (raw === "chefagence") return "chefAgence";
  if (raw === "agentcourrier") return "agentCourrier";
  if (raw === "chefembarquement") return "chefEmbarquement";
  if (raw === "agency_boarding_officer" || raw === "embarquement") return "chefEmbarquement";
  return CANONICAL_ROLES.has(raw) ? (raw as Role) : "unauthenticated";
};

const defaultLandingByRole: Partial<Record<Role, string>> = {
  admin_platforme: "/admin/dashboard",
  admin_compagnie: "/role-landing",
  company_accountant: "/role-landing",
  financial_director: "/role-landing",
  operator_digital: "/role-landing",
  responsable_logistique: "/compagnie/garage/dashboard",
  chefAgence: "/agence/activite",
  superviseur: "/agence/activite",
  agentCourrier: "/agence/courrier",
  agency_accountant: "/agence/comptabilite",
  guichetier: "/agence/guichet",
  chefEmbarquement: "/agence/boarding",
  agency_fleet_controller: "/agence/fleet",
  escale_agent: "/agence/escale",
  escale_manager: "/agence/escale",
  unauthenticated: "/login",
  user: "/login",
};

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : v ? [String(v)] : [];

/* =========================
   Component
========================= */
const PrivateRoute: React.FC<PrivateRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-600">
        Vérification de l'authentification...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const userRoles = asArray(user.role).map(normalizeRole);
  const allowedSet = new Set(allowedRoles.map((r) => String(r).toLowerCase()));
  const isAllowed = userRoles.some((r) => allowedSet.has(String(r).toLowerCase()));

  if (!isAllowed) {
    const role = userRoles[0];
    if (role === "responsable_logistique" && user?.companyId) {
      return <Navigate to={`/compagnie/${user.companyId}/garage/dashboard`} replace />;
    }
    const fallback =
      userRoles.map((r) => defaultLandingByRole[r]).find(Boolean) || "/login";
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;