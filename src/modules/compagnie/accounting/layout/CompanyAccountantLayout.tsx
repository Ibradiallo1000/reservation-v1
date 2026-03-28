// src/modules/compagnie/accounting/layout/CompanyAccountantLayout.tsx
// Dedicated layout for company_accountant / financial_director.
// Strictly scoped: NO access to CEO menus (fleet, agencies, config, etc.)
import React, { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  Globe,
  CreditCard,
  TrendingUp,
  FileText,
  Settings,
  Wallet,
  Receipt,
  BookOpen,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import {
  useOnlineStatus,
  useAgencyDarkMode,
  useAgencyKeyboardShortcuts,
  AgencyHeaderExtras,
} from "@/modules/agence/shared";
import { usePendingExpensesCount } from "@/shared/hooks/usePendingExpensesCount";
import NotificationsBell from "@/modules/compagnie/notifications/NotificationsBell";

interface Company {
  id: string;
  nom: string;
  slug: string;
  logoUrl?: string;
  devise?: string;
  [key: string]: any;
}

const CompanyAccountantLayout: React.FC = () => {
  const params = useParams();
  const { user, logout, company, loading } = useAuth() as any;
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const urlCompanyId = params.companyId;
  const userCompanyId = user?.companyId;
  const currentCompanyId = urlCompanyId || userCompanyId;

  const isImpersonationMode = Boolean(
    user?.role === "admin_platforme" && urlCompanyId,
  );

  const [currentCompany, setCurrentCompany] = useState<Company | null>(
    company,
  );

  useEffect(() => {
    if (!urlCompanyId || urlCompanyId === userCompanyId) {
      setCurrentCompany(company);
      return;
    }
    (async () => {
      try {
        const companyDoc = await getDoc(doc(db, "companies", urlCompanyId));
        if (companyDoc.exists()) {
          const data = companyDoc.data();
          setCurrentCompany({
            id: companyDoc.id,
            nom: data.nom || "",
            slug: data.slug || "",
            logoUrl: data.logoUrl,
            ...data,
          } as Company);
        }
      } catch (error) {
        console.error("[AccountantLayout] Error loading company:", error);
      }
    })();
  }, [urlCompanyId, userCompanyId, company]);

  const theme = useCompanyTheme(currentCompany);

  const pendingExpensesCount = usePendingExpensesCount(currentCompanyId, user?.role);

  /* ===== Navigation — accountant-scoped only ===== */
  const basePath = `/compagnie/${currentCompanyId}/accounting`;

  const sections: NavSection[] = [
    { label: "Pilotage consolidé", icon: Globe, path: basePath, end: true },
    {
      label: "Réservations réseau",
      icon: CreditCard,
      path: `${basePath}/reservations-reseau`,
    },
    { label: "Finances consolidées", icon: TrendingUp, path: `${basePath}/finances` },
    { label: "Comptabilité", icon: BookOpen, path: `${basePath}/compta` },
    {
      label: "Dépenses",
      icon: Receipt,
      path: `${basePath}/expenses`,
      badge: pendingExpensesCount || undefined,
      children: [
        { label: "Validation & paiement", path: `${basePath}/expenses`, end: true },
        { label: "Analyse des dépenses", path: `${basePath}/expenses-dashboard` },
      ],
    },
    {
      label: "Trésorerie",
      icon: Wallet,
      path: `${basePath}/treasury`,
      children: [
        { label: "Nouvelle opération", path: `${basePath}/treasury/new-operation` },
        { label: "Transfert", path: `${basePath}/treasury/transfer` },
        { label: "Nouveau payable", path: `${basePath}/treasury/new-payable` },
        { label: "Paiements fournisseurs", path: `${basePath}/supplier-payments` },
      ],
    },
    { label: "Rapports", icon: FileText, path: `${basePath}/rapports` },
    { label: "Paramètres", icon: Settings, path: `${basePath}/parametres` },
  ];

  useAgencyKeyboardShortcuts(sections);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            style={{
              borderColor: `${(theme as any)?.colors?.primary ?? "#FF6600"} transparent transparent transparent`,
            }}
          />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  const bannerContent = isImpersonationMode ? (
    <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        <span className="text-sm text-yellow-800">
          Mode inspection comptable : <strong>{currentCompany?.nom}</strong>
        </span>
        <button
          onClick={() => (window.location.href = "/admin/compagnies")}
          className="text-sm bg-yellow-600 text-white px-3 py-1 rounded-lg hover:bg-yellow-700 transition"
        >
          Retour admin
        </button>
      </div>
    </div>
  ) : null;

  return (
    <CurrencyProvider currency={currentCompany?.devise}>
      <div className={darkMode ? "agency-dark" : ""}>
        <InternalLayout
          sections={sections}
          role={user?.role || "company_accountant"}
          userName={user?.displayName || undefined}
          userEmail={user?.email || undefined}
          brandName={currentCompany?.nom || "Compagnie"}
          logoUrl={currentCompany?.logoUrl}
          primaryColor={(theme as any)?.colors?.primary}
          secondaryColor={(theme as any)?.colors?.secondary}
          onLogout={logout}
          banner={bannerContent}
          headerRight={
            <div className="flex items-center gap-2">
              <NotificationsBell
                companyId={currentCompanyId}
                userId={user?.uid}
                role={user?.role}
              />
              <AgencyHeaderExtras
                isOnline={isOnline}
                darkMode={darkMode}
                onDarkModeToggle={toggleDarkMode}
                showThemeToggle={false}
              />
            </div>
          }
          headerLeft={
            <div className="hidden sm:flex items-center gap-2 text-sm min-w-0">
              <span className="font-semibold text-gray-900 truncate">{currentCompany?.nom || "Compagnie"}</span>
              <span className="text-gray-300">/</span>
              <span className="text-gray-600 truncate">Comptabilité centrale</span>
            </div>
          }
          mainClassName="agency-content-transition"
        />
      </div>
    </CurrencyProvider>
  );
};

export default CompanyAccountantLayout;
