import React from "react";
import PrivateRoute from "./PrivateRoute";
import { AuthCurrencyProvider } from "@/shared/currency/CurrencyContext";
import type { Role } from "@/roles-permissions";
import type { RequiredContext } from "@/authorization/spaces";

type AllowedRoles = readonly (Role | string)[];

interface ProtectedRouteProps {
  allowedRoles: AllowedRoles;
  /** Enveloppe les enfants dans AuthCurrencyProvider (devise compagnie) */
  withCurrency?: boolean;
  requiredContext?: RequiredContext;
  featureActive?: boolean;
  children: React.ReactNode;
}

/**
 * Route protégée par rôle, avec option devise. Évite de répéter PrivateRoute + AuthCurrencyProvider.
 */
export default function ProtectedRoute({ allowedRoles, withCurrency, children, requiredContext, featureActive }: ProtectedRouteProps) {
  return (
    <PrivateRoute allowedRoles={allowedRoles as readonly Role[]} requiredContext={requiredContext} featureActive={featureActive}>
      {withCurrency ? <AuthCurrencyProvider>{children}</AuthCurrencyProvider> : children}
    </PrivateRoute>
  );
}
