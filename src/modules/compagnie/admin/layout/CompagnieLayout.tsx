// src/modules/compagnie/admin/layout/CompagnieLayout.tsx
// Refactored to use InternalLayout — aligned with agence (réseau, dark, F2).
import React from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  Settings,
  BarChart2,
  MessageSquare,
  Gauge,
  DollarSign,
  Truck,
  TrendingUp,
  FileCheck,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { lightenForDarkMode } from "@/utils/color";
import { PageHeaderProvider } from "@/contexts/PageHeaderContext";
import InternalLayout from "@/shared/layout/InternalLayout";
import type { NavSection } from "@/shared/layout/InternalLayout";
import { DESIGN } from "@/app/design-system";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import { SubscriptionBanner } from "@/shared/subscription";
import type { SubscriptionStatus } from "@/shared/subscription";
import { Timestamp } from "firebase/firestore";
import { useOnlineStatus, useAgencyDarkMode, useAgencyKeyboardShortcuts, AgencyHeaderExtras } from "@/modules/agence/shared";

interface Company {
  id: string;
  nom: string;
  slug: string;
  logoUrl?: string;
  [key: string]: any;
}

/* ================= LAYOUT ================= */
const CompagnieLayout: React.FC = () => {
  const params = useParams();
  const { user, logout, company, loading } = useAuth();
  const isOnline = useOnlineStatus();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const urlCompanyId = params.companyId;
  const userCompanyId = user?.companyId;
  const currentCompanyId = urlCompanyId || userCompanyId;

  const isImpersonationMode = Boolean(
    user?.role === "admin_platforme" && urlCompanyId,
  );

  const [currentCompany, setCurrentCompany] = React.useState<Company | null>(
    company,
  );

  // Load company from Firestore when impersonating
  React.useEffect(() => {
    if (!urlCompanyId || urlCompanyId === userCompanyId) {
      setCurrentCompany(company);
      return;
    }
    const loadCompanyFromUrl = async () => {
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
          });
        }
      } catch (error) {
        console.error("Error loading company:", error);
      }
    };
    loadCompanyFromUrl();
  }, [urlCompanyId, userCompanyId, company]);

  const theme = useCompanyTheme(currentCompany);

  /* ===== BADGES ===== */
  const [onlineProofsCount, setOnlineProofsCount] = React.useState(0);
  const [pendingReviewsCount, setPendingReviewsCount] = React.useState(0);

  React.useEffect(() => {
    if (!currentCompanyId) return;
    let unsubs: Array<() => void> = [];
    const countsByAgence = new Map<string, number>();

    (async () => {
      const agencesSnap = await getDocs(
        collection(db, "companies", currentCompanyId, "agences"),
      );
      agencesSnap.docs.forEach((d) => {
        const agenceId = d.id;
        const qAg = query(
          collection(
            db,
            "companies",
            currentCompanyId,
            "agences",
            agenceId,
            "reservations",
          ),
          where("statut", "==", "preuve_recue"),
        );
        const unsub = onSnapshot(qAg, (snap) => {
          countsByAgence.set(agenceId, snap.size);
          setOnlineProofsCount(
            Array.from(countsByAgence.values()).reduce((a, b) => a + b, 0),
          );
        });
        unsubs.push(unsub);
      });
    })();

    return () => unsubs.forEach((u) => u());
  }, [currentCompanyId]);

  React.useEffect(() => {
    if (!currentCompanyId) return;
    const qAvis = query(
      collection(db, "companies", currentCompanyId, "avis"),
      where("visible", "==", false),
    );
    const unsub = onSnapshot(qAvis, (snap) =>
      setPendingReviewsCount(snap.size),
    );
    return () => unsub();
  }, [currentCompanyId]);

  // Navigation : Command Center, Revenue & Liquidity, Network Performance, Operations, Fleet, Control & Audit, Configuration
  const basePath = urlCompanyId
    ? `/compagnie/${urlCompanyId}`
    : "/compagnie";

  const sections: NavSection[] = [
    { label: "Poste de Pilotage", icon: Gauge, path: `${basePath}/command-center` },
    { label: "Revenus & Liquidités", icon: DollarSign, path: `${basePath}/revenus-liquidites` },
    { label: "Performance Réseau", icon: TrendingUp, path: `${basePath}/dashboard` },
    { label: "Opérations", icon: BarChart2, path: `${basePath}/operations-reseau`, badge: onlineProofsCount },
    { label: "Flotte", icon: Truck, path: `${basePath}/fleet` },
    { label: "Contrôle & Audit", icon: FileCheck, path: `${basePath}/comptabilite` },
    { label: "Avis Clients", icon: MessageSquare, path: `${basePath}/avis-clients`, badge: pendingReviewsCount },
    { label: "Configuration", icon: Settings, path: `${basePath}/parametres` },
  ];

  useAgencyKeyboardShortcuts(sections);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div
            className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4"
            style={{ borderColor: `${theme.colors.primary} transparent transparent transparent` }}
          />
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  // Subscription status from company data
  const subStatus = (currentCompany as any)?.subscriptionStatus as SubscriptionStatus | undefined;
  const trialEndsAtRaw = (currentCompany as any)?.trialEndsAt;
  const trialEndsAt = trialEndsAtRaw instanceof Timestamp
    ? trialEndsAtRaw.toDate()
    : trialEndsAtRaw instanceof Date
      ? trialEndsAtRaw
      : null;

  const bannerContent = (
    <>
      {isImpersonationMode && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <span className="text-sm text-yellow-800">
              Mode inspection : <strong>{currentCompany?.nom}</strong>
            </span>
            <button
              onClick={() => (window.location.href = "/admin/compagnies")}
              className="text-sm bg-yellow-600 text-white px-3 py-1 rounded-lg hover:bg-yellow-700 transition"
            >
              Retour admin
            </button>
          </div>
        </div>
      )}
      <SubscriptionBanner
        subscriptionStatus={subStatus}
        trialEndsAt={trialEndsAt}
        companyName={currentCompany?.nom}
      />
    </>
  );

  const primary = (theme?.colors?.primary ?? "#FF6600").trim();
  const secondary = (theme?.colors?.secondary ?? "#FFFFFF").trim();
  const cssVars = React.useMemo(() => {
    if (darkMode) {
      return {
        "--teliya-primary": lightenForDarkMode(primary),
        "--teliya-secondary": lightenForDarkMode(secondary),
      } as React.CSSProperties;
    }
    return {
      "--teliya-primary": primary,
      "--teliya-secondary": secondary,
    } as React.CSSProperties;
  }, [darkMode, primary, secondary]);

  return (
    <CurrencyProvider currency={(currentCompany as any)?.devise}>
      <PageHeaderProvider>
        <div className={darkMode ? "agency-dark" : ""} style={cssVars}>
          <InternalLayout
            sections={sections}
            role={(user as any)?.role || "admin_compagnie"}
            userName={user?.displayName || undefined}
            userEmail={user?.email || undefined}
            brandName={currentCompany?.nom || "Compagnie"}
            logoUrl={currentCompany?.logoUrl}
            primaryColor={theme.colors.primary}
            secondaryColor={theme.colors.secondary}
            onLogout={logout}
            banner={bannerContent}
            headerRight={
              <AgencyHeaderExtras isOnline={isOnline} darkMode={darkMode} onDarkModeToggle={toggleDarkMode} />
            }
            mainClassName="agency-content-transition"
          />
        </div>
      </PageHeaderProvider>
    </CurrencyProvider>
  );
};

export default CompagnieLayout;
