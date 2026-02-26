// src/modules/compagnie/layout/GarageLayout.tsx
// Layout dédié Chef Garage : uniquement Flotte + Configuration (pas d’accès CEO).
import React from "react";
import { useParams } from "react-router-dom";
import { LayoutDashboard, List, Wrench, MapPin, AlertTriangle, Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { PageHeaderProvider } from "@/contexts/PageHeaderContext";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { useAgencyDarkMode } from "@/modules/agence/shared";
import { GarageThemeProvider } from "./GarageThemeContext";

const GarageLayout: React.FC = () => {
  const params = useParams();
  const { user, logout, company, loading } = useAuth();
  const urlCompanyId = params.companyId;
  const userCompanyId = user?.companyId;
  const currentCompanyId = urlCompanyId || userCompanyId;

  const [currentCompany, setCurrentCompany] = React.useState<Company | null>(
    (company ?? null) as Company | null
  );

  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  React.useEffect(() => {
    if (darkMode) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    return () => document.documentElement.classList.remove("dark");
  }, [darkMode]);

  const theme = useCompanyTheme(currentCompany);
  const garageTheme = React.useMemo(
    () => ({
      primary: theme?.primary ?? "#475569",
      secondary: theme?.secondary ?? "#64748b",
      primaryDark: theme?.primaryDark,
      primaryLight: theme?.primaryLight,
      buttonText: (theme as any)?.colors?.buttonText ?? "#ffffff",
    }),
    [theme]
  );

  React.useEffect(() => {
    if (!urlCompanyId || urlCompanyId === userCompanyId) {
      setCurrentCompany(company as Company | null);
      return;
    }
    const loadCompanyFromUrl = async () => {
      try {
        const companyDoc = await getDoc(doc(db, "companies", urlCompanyId));
        if (companyDoc.exists()) {
          const data = companyDoc.data() as Record<string, unknown>;
          setCurrentCompany({
            id: companyDoc.id,
            nom: (data.nom as string) || "",
            slug: (data.slug as string) ?? "",
            logoUrl: data.logoUrl as string | undefined,
            ...data,
          } as Company);
        }
      } catch (error) {
        console.error("Error loading company:", error);
      }
    };
    loadCompanyFromUrl();
  }, [urlCompanyId, userCompanyId, company]);

  const basePath = urlCompanyId
    ? `/compagnie/${urlCompanyId}/garage`
    : "/compagnie/garage";

  const sections: NavSection[] = [
    { label: "Tableau de bord", icon: LayoutDashboard, path: `${basePath}/dashboard`, end: true },
    { label: "Liste flotte", icon: List, path: `${basePath}/fleet`, end: true },
    { label: "Maintenance", icon: Wrench, path: `${basePath}/maintenance`, end: true },
    { label: "Transit", icon: MapPin, path: `${basePath}/transit`, end: true },
    { label: "Incidents", icon: AlertTriangle, path: `${basePath}/incidents`, end: true },
  ];

  const headerRight = (
    <button
      type="button"
      onClick={toggleDarkMode}
      className="p-2 rounded-lg transition text-xs bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200"
      title={darkMode ? "Mode jour" : "Mode nuit"}
    >
      {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={darkMode ? "agency-dark" : ""}>
      <CurrencyProvider currency={(currentCompany as any)?.devise}>
        <PageHeaderProvider>
          <GarageThemeProvider value={garageTheme}>
            <InternalLayout
              sections={sections}
              role={(user as any)?.role || "chef_garage"}
              userName={user?.displayName || undefined}
              userEmail={user?.email || undefined}
              brandName={currentCompany?.nom || "Garage"}
              logoUrl={currentCompany?.logoUrl}
              primaryColor={garageTheme.primary}
              secondaryColor={garageTheme.secondary}
              onLogout={logout}
              mainClassName="garage-content"
              headerRight={headerRight}
            />
          </GarageThemeProvider>
        </PageHeaderProvider>
      </CurrencyProvider>
    </div>
  );
};

export default GarageLayout;
