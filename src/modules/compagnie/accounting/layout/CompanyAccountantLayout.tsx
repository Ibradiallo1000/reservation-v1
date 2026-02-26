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

  /* ===== Pending proof-of-payment badge ===== */
  const [pendingCount, setPendingCount] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playedIds = useRef(new Set<string>());

  useEffect(() => {
    const initAudio = () => {
      if (!audioRef.current) {
        audioRef.current = new Audio("/notification.mp3");
        audioRef.current.preload = "auto";
      }
      document.removeEventListener("click", initAudio);
      document.removeEventListener("keydown", initAudio);
    };
    document.addEventListener("click", initAudio);
    document.addEventListener("keydown", initAudio);
    return () => {
      document.removeEventListener("click", initAudio);
      document.removeEventListener("keydown", initAudio);
    };
  }, []);

  useEffect(() => {
    if (!currentCompanyId) return;
    const unsubs: Array<() => void> = [];
    const countsByAgency = new Map<string, number>();

    (async () => {
      try {
        const agencesSnap = await getDocs(
          collection(db, "companies", currentCompanyId, "agences"),
        );
        agencesSnap.docs.forEach((agenceDoc) => {
          const agencyId = agenceDoc.id;
          const q = query(
            collection(
              db,
              "companies",
              currentCompanyId,
              "agences",
              agencyId,
              "reservations",
            ),
            where("statut", "==", "preuve_recue"),
          );
          const unsub = onSnapshot(q, (snap) => {
            countsByAgency.set(agencyId, snap.size);
            setPendingCount(
              Array.from(countsByAgency.values()).reduce((a, b) => a + b, 0),
            );

            snap.docChanges().forEach((change) => {
              if (change.type === "added") {
                const key = `${agencyId}_${change.doc.id}`;
                const data = change.doc.data() as any;
                const createdAt = data.createdAt?.toDate?.();
                if (createdAt && Date.now() - createdAt.getTime() > 30_000) {
                  playedIds.current.add(key);
                  return;
                }
                if (!playedIds.current.has(key)) {
                  if (audioRef.current) {
                    try {
                      audioRef.current.currentTime = 0;
                      audioRef.current.play().catch(() => {});
                    } catch {}
                  }
                  playedIds.current.add(key);
                }
              }
            });
          });
          unsubs.push(unsub);
        });
      } catch (error) {
        console.error("[AccountantLayout] Init error:", error);
      }
    })();

    return () => unsubs.forEach((u) => u());
  }, [currentCompanyId]);

  /* ===== Navigation — accountant-scoped only ===== */
  const basePath = `/compagnie/${currentCompanyId}/accounting`;

  const sections: NavSection[] = [
    { label: "Vue Globale", icon: Globe, path: basePath, end: true },
    {
      label: "Réservations",
      icon: CreditCard,
      path: `${basePath}/reservations-en-ligne`,
      badge: pendingCount,
    },
    { label: "Finances", icon: TrendingUp, path: `${basePath}/finances` },
    { label: "Trésorerie", icon: Wallet, path: `${basePath}/treasury` },
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
            <AgencyHeaderExtras
              isOnline={isOnline}
              darkMode={darkMode}
              onDarkModeToggle={toggleDarkMode}
            />
          }
          mainClassName="agency-content-transition"
        />
      </div>
    </CurrencyProvider>
  );
};

export default CompanyAccountantLayout;
