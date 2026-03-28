/**
 * Poste courrier plein écran — sans sidebar agence, structure type guichet (barre + onglets).
 */

import React, { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useOnlineStatus, useAgencyDarkMode } from "@/modules/agence/shared";
import { CourierWorkspaceProvider, useCourierWorkspace } from "../context/CourierWorkspaceContext";
import { CourierPosBar } from "../components/CourierPosBar";
import { CourierTabStrip } from "../components/CourierTabStrip";
import { CourierClosedScreen } from "../components/CourierClosedScreen";
import { SectionCard } from "@/ui";
import { buildAgencyChromeStyleVars } from "@/shared/theme/agencySurfaceGradients";

const ALLOWED_COURRIER_ROLES = ["agentCourrier", "chefAgence", "admin_compagnie"] as const;

function isCourierReadOnlyPath(pathname: string): boolean {
  return (
    pathname.startsWith("/agence/courrier/rapport") ||
    pathname.startsWith("/agence/courrier/historique")
  );
}

function CourierLayoutInner() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth() as { user?: { displayName?: string; email?: string }; logout: () => Promise<void> };
  const w = useCourierWorkspace();
  const {
    counterUiStatus,
    isSessionLoading,
    showCloseModal,
    cancelCloseComptoir,
    confirmCloseComptoir,
    hubLoading,
    hubError,
    setHubError,
    primaryColor,
    secondaryColor,
  } = w;

  const readOnlyCourierTab = isCourierReadOnlyPath(pathname);
  /** Guichet création envoi : hauteur fixée par la page (calc 100dvh − chrome), sans scroll vertical sur main. */
  const courierCreateGuichetPath = /\/agence\/courrier\/nouveau\/?$/.test(pathname);
  const operationalCourierTab =
    pathname.startsWith("/agence/courrier") && !readOnlyCourierTab;
  const showSessionSkeleton = operationalCourierTab && isSessionLoading;
  const showClosedOverlay =
    operationalCourierTab && !isSessionLoading && counterUiStatus !== "open";

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div
      lang="fr"
      className="flex h-screen flex-col overflow-hidden"
      style={{ backgroundImage: "var(--agency-gradient-page)" }}
    >
      <CourierPosBar onLogout={handleLogout} />
      <CourierTabStrip />

      {hubError && (
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200 lg:px-6">
          <span>{hubError}</span>
          <button type="button" className="underline" onClick={() => setHubError(null)}>
            Fermer
          </button>
        </div>
      )}

      <main
        className={cn(
          "min-h-0 flex-1",
          courierCreateGuichetPath
            ? "flex flex-col overflow-hidden"
            : "overflow-y-auto",
          courierCreateGuichetPath && "lg:min-h-0"
        )}
      >
        {showSessionSkeleton ? (
          <div className="mx-auto max-w-[1600px] px-4 py-8 lg:px-6" aria-busy="true" aria-label="Chargement session">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-800" />
            <div className="mt-6 h-32 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
            <div className="mt-4 h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-900" />
          </div>
        ) : showClosedOverlay ? (
          <CourierClosedScreen />
        ) : courierCreateGuichetPath ? (
          <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:min-h-0">
            <Outlet />
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <SectionCard title="Clôturer le comptoir" className="w-full max-w-sm">
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Le comptable pourra valider la session avec le montant compté, en le comparant au ledger (financialTransactions).
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelCloseComptoir}
                className="min-h-[44px] rounded-lg border border-gray-300 px-4 py-2.5 dark:border-gray-600 dark:text-gray-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmCloseComptoir()}
                disabled={hubLoading}
                className="min-h-[44px] rounded-lg px-4 py-2.5 text-white disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                Confirmer
              </button>
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

const CourierLayout: React.FC = () => {
  const { user, company } = useAuth() as {
    user: { role?: string | string[]; companyId?: string; agencyId?: string; agencyNom?: string; agencyName?: string };
    company: unknown;
  };
  const theme = useCompanyTheme(company as Company | null);
  const [darkMode] = useAgencyDarkMode();
  const isOnline = useOnlineStatus();

  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const has = (r: string) => rolesArr.includes(r);
  const canUseCourrier = ALLOWED_COURRIER_ROLES.some((r) => has(r));

  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const [agencyNameFromDb, setAgencyNameFromDb] = useState("");

  useEffect(() => {
    if (!companyId || !agencyId) {
      setAgencyNameFromDb("");
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "companies", companyId, "agences", agencyId))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const name = (data?.name ?? data?.nom ?? data?.nomAgence ?? user?.agencyNom ?? user?.agencyName ?? "Agence") as string;
        if (!cancelled) setAgencyNameFromDb(name || "Agence");
      })
      .catch(() => {
        if (!cancelled) setAgencyNameFromDb(user?.agencyNom ?? user?.agencyName ?? "Agence");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId, user?.agencyName, user?.agencyNom]);

  const agencyNameResolved = agencyNameFromDb || user?.agencyNom || user?.agencyName || "Agence";

  const primary = (theme?.colors?.primary ?? "#ea580c").trim();
  const secondary = (theme?.colors?.secondary ?? "#f97316").trim();
  const cssVars = useMemo(() => {
    const chrome = buildAgencyChromeStyleVars(primary, secondary, darkMode);
    return {
      ...chrome,
      "--courier-primary": "var(--teliya-primary)",
      "--courier-secondary": "var(--teliya-secondary)",
    } as React.CSSProperties;
  }, [darkMode, primary, secondary]);

  if (!canUseCourrier) {
    return null;
  }

  return (
    <div className={darkMode ? "agency-dark" : ""} style={cssVars}>
      <CourierWorkspaceProvider
        agencyNameResolved={agencyNameResolved}
        primaryColor={primary}
        secondaryColor={secondary}
        isOnline={isOnline}
      >
        <CourierLayoutInner />
      </CourierWorkspaceProvider>
    </div>
  );
};

export default CourierLayout;
