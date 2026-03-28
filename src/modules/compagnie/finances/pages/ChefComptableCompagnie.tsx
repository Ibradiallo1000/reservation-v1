// src/modules/compagnie/finances/pages/ChefComptableCompagnie.tsx
// Refactored to use InternalLayout — aligned with agence/CEO (réseau, dark, F2).
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import {
  Globe,
  CreditCard,
  TrendingUp,
  FileText,
  Wallet,
  BookOpen,
  Receipt,
} from "lucide-react";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus, useAgencyDarkMode, useAgencyKeyboardShortcuts, AgencyHeaderExtras } from "@/modules/agence/shared";

const ChefComptableCompagniePage: React.FC = () => {
  const { user, logout, company } = useAuth() as any;
  const navigate = useNavigate();
  const theme = useCompanyTheme(company) || {
    colors: { primary: "#FF6600", secondary: "#F97316" },
  };
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("Compagnie");

  useEffect(() => {
    if (!user?.companyId) return;
    (async () => {
      try {
        const companyDoc = await getDoc(doc(db, "companies", user.companyId));
        if (companyDoc.exists()) {
          const c = companyDoc.data() as any;
          setCompanyLogo(c.logoUrl || c.logo || null);
          setCompanyName(c.nom || c.name || "Compagnie");
        }
      } catch (error) {
        console.error("[ChefComptable] Error loading company:", error);
      }
    })();
  }, [user?.companyId]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  const sections: NavSection[] = [
    { label: "Vue Globale", icon: Globe, path: "/chef-comptable", end: true },
    ...(user?.companyId
      ? [
          {
            label: "Réservations réseau",
            icon: CreditCard,
            path: `/compagnie/${user.companyId}/accounting/reservations-reseau`,
          } as NavSection,
        ]
      : []),
    { label: "Finances", icon: TrendingUp, path: "/chef-comptable/finances" },
    { label: "Compta", icon: BookOpen, path: "/chef-comptable/compta" },
    { label: "Dépenses", icon: Receipt, path: "/chef-comptable/depenses" },
    { label: "Trésorerie", icon: Wallet, path: "/chef-comptable/treasury" },
    { label: "Rapports", icon: FileText, path: "/chef-comptable/rapports" },
  ];

  useAgencyKeyboardShortcuts(sections);

  return (
    <CurrencyProvider currency={company?.devise}>
      <div className={darkMode ? "agency-dark" : ""}>
        <InternalLayout
          sections={sections}
          role={user?.role || "company_accountant"}
          userName={user?.displayName || undefined}
          userEmail={user?.email || undefined}
          brandName={companyName}
          logoUrl={companyLogo || undefined}
          primaryColor={(theme as any)?.colors?.primary || (theme as any)?.primary}
          secondaryColor={(theme as any)?.colors?.secondary || (theme as any)?.secondary}
          onLogout={handleLogout}
          headerRight={
            <AgencyHeaderExtras isOnline={isOnline} darkMode={darkMode} onDarkModeToggle={toggleDarkMode} showThemeToggle={false} />
          }
          mainClassName="agency-content-transition"
        />
      </div>
    </CurrencyProvider>
  );
};

export default ChefComptableCompagniePage;
