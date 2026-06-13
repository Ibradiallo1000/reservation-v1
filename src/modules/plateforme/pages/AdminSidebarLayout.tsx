// src/modules/plateforme/pages/AdminSidebarLayout.tsx
// Refactored to use InternalLayout — single source of truth.
import React from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Home,
  Building,
  DollarSign,
  Settings,
  Image as ImageIcon,
  CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { DESIGN } from "@/app/design-system";

const MENU: NavSection[] = [
  { label: "Tableau de bord", icon: Home, path: "dashboard", end: true },
  { label: "Compagnies", icon: Building, path: "compagnies" },
  { label: "Abonnements", icon: CreditCard, path: "subscriptions" },
  { label: "Activite", icon: Activity, path: "revenus" },
  { label: "Facturation", icon: DollarSign, path: "finances" },
  { label: "Plans & tarifs", icon: DollarSign, path: "plans" },
  { label: "Médias", icon: ImageIcon, path: "media" },
  { label: "Moyens de paiement", icon: CreditCard, path: "payment-methods" },
  { label: "Paramètres", icon: Settings, path: "parametres-platforme" },
];


const AdminSidebarLayout: React.FC = () => {
  const { user, logout } = useAuth() as any;
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  const roleLabel = Array.isArray(user?.role)
    ? user.role.join(", ")
    : user?.role || "admin_platforme";

  return (
    <InternalLayout
      sections={MENU}
      role={roleLabel}
      userName={user?.displayName || undefined}
      userEmail={user?.email || undefined}
      brandName="Teliya"
      logoUrl="/images/teliya-logo.jpg"
      primaryColor={DESIGN.defaultTheme.primary}
      onLogout={handleLogout}
    />
  );
};

export default AdminSidebarLayout;
