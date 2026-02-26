// src/modules/agence/pages/AgenceShellPage.tsx
// Refactored to use InternalLayout — preserves role guard logic.
import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import {
  LayoutDashboard,
  ClipboardList,
  MapPinned,
  ClipboardCheck,
  Wrench,
  Coins,
  FileBarChart2,
  Banknote,
  Wallet,
  Ticket,
  Users,
} from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import { SubscriptionBanner } from "@/shared/subscription";
import type { SubscriptionStatus } from "@/shared/subscription";
import { Timestamp } from "firebase/firestore";

const AGENCY_SECTIONS: NavSection[] = [
  { label: "Tableau de bord Manager", icon: LayoutDashboard, path: "/agence/manager-dashboard", end: true },
  { label: "Réservations", icon: ClipboardList, path: "/agence/reservations" },
  { label: "Trésorerie", icon: Wallet, path: "/agence/treasury" },
  { label: "Embarquement", icon: ClipboardCheck, path: "/agence/boarding" },
  { label: "Trajets", icon: MapPinned, path: "/agence/trajets" },
  { label: "Flotte", icon: Wrench, path: "/agence/fleet" },
  { label: "Recettes", icon: Coins, path: "/agence/recettes" },
  { label: "Rapports", icon: FileBarChart2, path: "/agence/rapports" },
  { label: "Finances", icon: Banknote, path: "/agence/finances" },
  { label: "Comptabilité", icon: Ticket, path: "/agence/comptabilite" },
  { label: "Personnel", icon: Users, path: "/agence/personnel" },
];

const AgenceShellPage: React.FC = () => {
  const { user, company, logout } = useAuth() as any;
  const navigate = useNavigate();
  const theme = useCompanyTheme(company);

  // ---- Role guard ----
  const rolesArr: string[] = Array.isArray(user?.role)
    ? user.role
    : user?.role
      ? [user.role]
      : [];
  const roles = new Set(rolesArr);
  const has = (r: string) => roles.has(r);

  const canUseShell =
    has("chefAgence") || has("superviseur") || has("admin_compagnie");

  if (!canUseShell) {
    if (has("chefEmbarquement")) return <Navigate to="/agence/boarding" replace />;
    if (has("agency_fleet_controller")) return <Navigate to="/agence/fleet" replace />;
    if (has("guichetier")) return <Navigate to="/agence/guichet" replace />;
    if (has("agency_accountant"))
      return <Navigate to="/agence/comptabilite" replace />;
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

  // Subscription banner
  const subStatus = company?.subscriptionStatus as SubscriptionStatus | undefined;
  const trialEndsAtRaw = company?.trialEndsAt;
  const trialEndsAt = trialEndsAtRaw instanceof Timestamp
    ? trialEndsAtRaw.toDate()
    : trialEndsAtRaw instanceof Date
      ? trialEndsAtRaw
      : null;

  return (
    <CurrencyProvider currency={company?.devise}>
      <InternalLayout
        sections={AGENCY_SECTIONS}
        role={rolesArr[0] || "chefAgence"}
        userName={user?.displayName || undefined}
        userEmail={user?.email || undefined}
        brandName={company?.nom || "Agence"}
        logoUrl={company?.logoUrl}
        primaryColor={theme?.colors?.primary}
        secondaryColor={theme?.colors?.secondary}
        onLogout={handleLogout}
        banner={null}
      />
    </CurrencyProvider>
  );
};

export default AgenceShellPage;
