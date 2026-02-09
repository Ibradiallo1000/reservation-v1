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
const normalizeRole = (r?: unknown): Role => {
  if (!r) return "user";

  const raw = String(r).trim().toLowerCase();

  console.log("🔍 PrivateRoute normalizeRole - raw input:", raw);

  const map: Record<string, Role> = {
    // PLATFORME
    'admin_platforme': "admin_platforme",
    'admin platforme': "admin_platforme",

    // COMPAGNIE (CEO)
    'admin_compagnie': "admin_compagnie",
    'compagnie': "admin_compagnie",
    'admin compagnie': "admin_compagnie",

    // COMPTABILITÉ COMPAGNIE
    'company_accountant': "company_accountant",
    'comptable_compagnie': "company_accountant",
    'comptable compagnie': "company_accountant",
    'comptable': "company_accountant",
    'chef comptable': "company_accountant",
    
    // DAF
    'financial_director': "financial_director",
    'daf': "financial_director",

    // AGENCE
    'chefagence': "chefAgence",
    'chef_agence': "chefAgence",
    'chef agence': "chefAgence",
    'superviseur': "chefAgence",
    'agentcourrier': "chefAgence",
    'agent_courrier': "chefAgence",

    'agency_accountant': "agency_accountant",
    'comptable_agence': "agency_accountant",
    'comptable agence': "agency_accountant",

    'guichetier': "guichetier",
    'embarquement': "embarquement",

    // DEFAULT
    'user': "user",
  };

  const result = map[raw] ?? "user";
  console.log("🔍 PrivateRoute normalizeRole - result:", result);
  
  return result;
};

const defaultLandingByRole: Record<Role, string> = {
  // PLATFORME
  admin_platforme: "/admin/dashboard",

  // COMPAGNIE
  admin_compagnie: "/compagnie/dashboard",
  company_accountant: "/comptable",
  financial_director: "/comptable",

  // AGENCE
  chefAgence: "/agence/dashboard",
  agency_accountant: "/agence/comptabilite",
  guichetier: "/agence/guichet",
  embarquement: "/agence/embarquement",

  // DEFAULT
  user: "/",
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

  console.log("🔍 PrivateRoute - Début");
  console.log("🔍 PrivateRoute - location.pathname:", location.pathname);
  console.log("🔍 PrivateRoute - user:", user);
  console.log("🔍 PrivateRoute - user?.role:", user?.role);
  console.log("🔍 PrivateRoute - allowedRoles:", allowedRoles);

  if (loading) {
    console.log("🔍 PrivateRoute - loading state");
    return (
      <div className="p-6 text-center text-gray-600">
        Vérification de l'authentification...
      </div>
    );
  }

  if (!user) {
    console.log("🔍 PrivateRoute - Pas d'utilisateur, redirection vers /login");
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const userRoles = asArray(user.role).map(normalizeRole);
  console.log("🔍 PrivateRoute - userRoles après normalisation:", userRoles);
  
  const isAllowed = userRoles.some((r) => allowedRoles.includes(r));
  console.log("🔍 PrivateRoute - isAllowed:", isAllowed);

  if (!isAllowed) {
    console.log("🔍 PrivateRoute - Accès refusé, calcul du fallback...");
    const fallback =
      userRoles.map((r) => defaultLandingByRole[r]).find(Boolean) || "/";
    console.log("🔍 PrivateRoute - fallback calculé:", fallback);
    return <Navigate to={fallback} replace />;
  }

  console.log("🔍 PrivateRoute - Accès autorisé, affichage des enfants");
  return <>{children}</>;
};

export default PrivateRoute;