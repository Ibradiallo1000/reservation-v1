import React from "react";
import PrivateRoute from "./PrivateRoute";
import { AuthCurrencyProvider } from "@/shared/currency/CurrencyContext";

type AllowedRoles = readonly string[];

interface ProtectedRouteProps {
  allowedRoles: AllowedRoles;
  /** Enveloppe les enfants dans AuthCurrencyProvider (devise compagnie) */
  withCurrency?: boolean;
  children: React.ReactNode;
}

/**
 * Route protégée par rôle, avec option devise. Évite de répéter PrivateRoute + AuthCurrencyProvider.
 */
export default function ProtectedRoute({ allowedRoles, withCurrency, children }: ProtectedRouteProps) {
  return (
    <PrivateRoute allowedRoles={allowedRoles}>
      {withCurrency ? <AuthCurrencyProvider>{children}</AuthCurrencyProvider> : children}
    </PrivateRoute>
  );
}
