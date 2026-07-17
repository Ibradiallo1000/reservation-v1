import React from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { CanonicalRole } from "@/authorization/roles";
import { normalizeRoles } from "@/authorization/roles";
import type { RequiredContext } from "@/authorization/spaces";
import AuthorizationStatePage from "./AuthorizationStatePage";

interface PrivateRouteProps {
  children: React.ReactNode;
  allowedRoles: readonly (CanonicalRole | string)[];
  requiredContext?: RequiredContext;
  featureActive?: boolean;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({
  children,
  allowedRoles,
  requiredContext = "none",
  featureActive = true,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const params = useParams();

  if (loading) {
    return <div className="p-6 text-center text-gray-600" role="status">Vérification de l’authentification…</div>;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  const userRoles = normalizeRoles(user.role);
  if (userRoles.length === 0) return <AuthorizationStatePage state="unknown_role" />;

  const companyId = String(params.companyId ?? user.companyId ?? "").trim();
  const agencyId = String(user.agencyId ?? "").trim();
  if (requiredContext === "company" && !companyId) return <AuthorizationStatePage state="missing_company" />;
  if (requiredContext === "agency") {
    if (!companyId) return <AuthorizationStatePage state="missing_company" />;
    if (!agencyId) return <AuthorizationStatePage state="missing_agency" />;
  }
  if (!featureActive) return <AuthorizationStatePage state="feature_unavailable" />;

  const allowedSet = new Set(normalizeRoles(allowedRoles));
  if (!userRoles.some((role) => allowedSet.has(role))) {
    return <AuthorizationStatePage state="access_denied" />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
