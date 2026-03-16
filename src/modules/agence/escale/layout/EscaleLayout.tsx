/**
 * Layout escale : header (logo compagnie, nom compagnie, ville escale, rôle utilisateur).
 * Pas d'affichage de route dans le header (une escale peut être utilisée par plusieurs routes).
 * Menu : Tableau de bord, Bus du jour, Caisse, Équipe.
 * Utilise couleurPrimaire / couleurSecondaire comme les autres pages.
 */
import React, { useEffect, useState, useCallback } from "react";
import { Navigate, useNavigate, Outlet } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { LayoutDashboard, Bus, Wallet, Users, UserCheck, ClipboardList } from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import type { Company } from "@/types/companyTypes";

const ESCALE_SECTIONS: NavSection[] = [
  { label: "Tableau de bord", icon: LayoutDashboard, path: "/agence/escale", end: true },
  { label: "Bus du jour", icon: Bus, path: "/agence/escale/bus" },
  { label: "Embarquement", icon: UserCheck, path: "/agence/escale/embarquement" },
  { label: "Manifeste bus", icon: ClipboardList, path: "/agence/escale/manifeste" },
  { label: "Caisse", icon: Wallet, path: "/agence/escale/caisse" },
  { label: "Équipe", icon: Users, path: "/agence/team" },
];

const ROLE_LABELS: Record<string, string> = {
  escale_agent: "Agent escale",
  escale_manager: "Chef d'escale",
  chefAgence: "Chef d'agence",
  admin_compagnie: "Admin compagnie",
};

const EscaleLayout: React.FC = () => {
  const { user, company, logout } = useAuth() as {
    user: { role?: string | string[]; displayName?: string; nom?: string; email?: string; companyId?: string; agencyId?: string };
    company: Company | null;
    logout: () => Promise<void>;
  };
  const navigate = useNavigate();
  const theme = useCompanyTheme(company ?? null);
  const [agencyDisplayName, setAgencyDisplayName] = useState<string>("Escale");
  const [loading, setLoading] = useState(true);

  const loadAgency = useCallback(async () => {
    if (!user?.companyId || !user?.agencyId) {
      setLoading(false);
      return;
    }
    try {
      const agencyRef = doc(db, "companies", user.companyId, "agences", user.agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (agencySnap.exists()) {
        const data = agencySnap.data() as { ville?: string; city?: string; nomAgence?: string; nom?: string; name?: string };
        const city = (data.ville ?? data.city ?? "").trim();
        setAgencyDisplayName(city || data.nomAgence || data.nom || data.name || "Escale");
      }
    } catch (_) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.companyId, user?.agencyId]);

  useEffect(() => {
    loadAgency();
  }, [loadAgency]);

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const canUseEscale = rolesArr.some((r) => ["escale_agent", "escale_manager", "chefAgence", "admin_compagnie"].includes(r));

  if (!canUseEscale) {
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

  const roleLabel = ROLE_LABELS[rolesArr[0]] ?? rolesArr[0] ?? "Escale";

  return (
    <InternalLayout
      sections={ESCALE_SECTIONS}
      role={roleLabel}
      userName={user?.displayName ?? user?.nom}
      userEmail={user?.email}
      brandName={loading ? "Escale" : `${company?.nom ?? "Compagnie"} — ${agencyDisplayName}`}
      logoUrl={(company as { logoUrl?: string })?.logoUrl}
      primaryColor={theme?.colors?.primary}
      secondaryColor={theme?.colors?.secondary}
      onLogout={handleLogout}
      mainClassName="agency-content-transition"
    >
      <Outlet />
    </InternalLayout>
  );
};

export default EscaleLayout;
