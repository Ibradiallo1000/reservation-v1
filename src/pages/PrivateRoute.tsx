import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export type Role =
  | "admin_platforme"
  | "admin_compagnie"
  | "compagnie"
  | "chefAgence"
  | "guichetier"
  | "superviseur"
  | "agentCourrier"
  | "comptable"
  | "embarquement"
  | "user"
  | "financier";

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles: readonly Role[];
}

const normalizeRole = (r?: unknown): Role => {
  const raw = String(r ?? "user").trim().toLowerCase();
  if (raw === "chef_agence" || raw === "chefagence") return "chefAgence";
  if (raw === "admin plateforme" || raw === "admin_platforme") return "admin_platforme";
  if (raw === "admin compagnie" || raw === "admin_compagnie") return "admin_compagnie";
  if (raw === "agent_courrier" || raw === "agentcourrier") return "agentCourrier";
  if (raw === "guichetier") return "guichetier";
  if (raw === "superviseur") return "superviseur";
  if (raw === "comptable") return "comptable";
  if (raw === "embarquement") return "embarquement";
  if (raw === "compagnie") return "compagnie";
  return "user";
};

const defaultLandingByRole: Record<Role, string> = {
  admin_platforme: "/admin/dashboard",
  admin_compagnie: "/compagnie/dashboard",
  compagnie: "/compagnie/dashboard",
  chefAgence: "/agence/dashboard",
  superviseur: "/agence/dashboard",
  agentCourrier: "/agence/dashboard",
  guichetier: "/agence/guichet",
  comptable: "/agence/comptabilite",
  embarquement: "/agence/embarquement",
  user: "/",
  financier: "",
};

const asArray = (v: unknown) => (Array.isArray(v) ? v : [v].filter(Boolean));

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children, allowedRoles }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Petit loader simple pour éviter l’écran blanc pendant la résolution auth
    return <div className="p-6 text-gray-600 text-center">Vérification de l'authentification…</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const userRoles = asArray((user as any).role).map(normalizeRole);
  const isAllowed = userRoles.some((r) => allowedRoles.includes(r));

  if (!isAllowed) {
    const firstLanding = userRoles.map((r) => defaultLandingByRole[r]).find(Boolean) || "/";
    return <Navigate to={firstLanding} replace />;
  }

  if (location.pathname === "/") {
    const firstLanding = userRoles.map((r) => defaultLandingByRole[r]).find(Boolean) || "/";
    if (firstLanding !== "/") return <Navigate to={firstLanding} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
