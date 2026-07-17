// src/modules/compagnie/admin/layout/CompagnieLayout.tsx
// Refactored to use InternalLayout — aligned with agence (réseau, dark, F2).
import React from "react";
import { useParams } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { lightenForDarkMode } from "@/utils/color";
import InternalLayout from "@/shared/layout/InternalLayout";
import { CurrencyProvider } from "@/shared/currency/CurrencyContext";
import { SubscriptionBanner } from "@/shared/subscription";
import type { SubscriptionStatus } from "@/shared/subscription";
import { Timestamp } from "firebase/firestore";
import { useAgencyDarkMode, useAgencyKeyboardShortcuts } from "@/modules/agence/shared";
import NotificationsBell from "@/modules/compagnie/notifications/NotificationsBell";
import { companyNavigation } from "@/navigation/company.navigation";
import { resolveNavigation, toNavSections } from "@/navigation/navigation.utils";

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
  const { user, logout, company, loading, refreshUser } = useAuth();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();

  const urlCompanyId = params.companyId;
  const userCompanyId = user?.companyId;
  const currentCompanyId = urlCompanyId || userCompanyId;

  // CEO sans companyId dans le profil : synchroniser depuis l’URL pour que les règles Firestore passent
  React.useEffect(() => {
    if (
      !user?.uid ||
      user.role !== "admin_compagnie" ||
      user.companyId ||
      !urlCompanyId
    )
      return;
    let cancelled = false;
    (async () => {
      try {
        await updateDoc(doc(db, "users", user.uid), { companyId: urlCompanyId });
        if (!cancelled) await refreshUser();
      } catch (e) {
        if (!cancelled) console.warn("CEO companyId sync:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, user?.role, user?.companyId, urlCompanyId, refreshUser]);

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

  const basePath = urlCompanyId
    ? `/compagnie/${urlCompanyId}`
    : "/compagnie";

  const sections = React.useMemo(
    () => toNavSections(resolveNavigation(companyNavigation(basePath), user?.role, {
      "company-reservations": onlineProofsCount || undefined,
    })),
    [basePath, onlineProofsCount, user?.role],
  );

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

  // Valeurs par défaut alignées : orange / blanc
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
          headerLeft={
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              {currentCompany?.logoUrl ? (
                <img
                  src={currentCompany.logoUrl}
                  alt={currentCompany?.nom || "Compagnie"}
                  className="h-8 w-8 shrink-0 rounded-full bg-white object-cover p-0.5"
                />
              ) : (
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/80 text-sm font-bold text-slate-700">
                  {(currentCompany?.nom || "C").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight text-slate-950 dark:text-white">
                  {currentCompany?.nom || "Compagnie"}
                </p>
                <p className="truncate text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400">
                  Command Center
                </p>
              </div>
            </div>
          }
          headerRight={
            <div className="flex items-center gap-1 lg:hidden">
              <NotificationsBell
                companyId={currentCompanyId}
                userId={user?.uid}
                role={user?.role}
              />
              <button
                type="button"
                onClick={toggleDarkMode}
                className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                title={darkMode ? "Mode jour" : "Mode nuit"}
                aria-label={darkMode ? "Mode jour" : "Mode nuit"}
              >
                {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          }
          headerActionsOnly
          hideDesktopHeader
          hideThemeToggle
          banner={bannerContent}
          sidebarFooterActions={
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/70">
                Commandes
              </span>
              <div className="flex items-center gap-2">
                <NotificationsBell
                  companyId={currentCompanyId}
                  userId={user?.uid}
                  role={user?.role}
                />
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                  title={darkMode ? "Mode jour" : "Mode nuit"}
                  aria-label={darkMode ? "Mode jour" : "Mode nuit"}
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              </div>
            </div>
          }
          mainClassName="agency-content-transition"
        />
      </div>
    </CurrencyProvider>
  );
};

export default CompagnieLayout;
