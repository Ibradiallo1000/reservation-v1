// src/modules/plateforme/pages/AdminSidebarLayout.tsx
// Refactored to use InternalLayout — single source of truth.
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InternalLayout from "@/shared/layout/InternalLayout";
import { DESIGN } from "@/app/design-system";
import { platformNavigation } from "@/navigation/platform.navigation";
import { resolveNavigation, toNavSections } from "@/navigation/navigation.utils";


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
  const sections = toNavSections(resolveNavigation(platformNavigation, user?.role));

  return (
    <InternalLayout
      sections={sections}
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
