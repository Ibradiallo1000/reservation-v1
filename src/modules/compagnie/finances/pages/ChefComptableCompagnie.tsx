// src/modules/compagnie/finances/pages/ChefComptableCompagnie.tsx
// Refactored to use InternalLayout — aligned with agence/CEO (réseau, dark, F2).
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
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
import {
  Globe,
  CreditCard,
  TrendingUp,
  FileText,
  Wallet,
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

  // ===== Notification state =====
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingByAgency, setPendingByAgency] = useState<
    Record<string, number>
  >({});
  const [playedIds, setPlayedIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("Compagnie");

  // Init audio on first interaction
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

  // Load company data
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

  // Compute total from per-agency counts
  useEffect(() => {
    const total = Object.values(pendingByAgency).reduce((a, b) => a + b, 0);
    setPendingCount(total);
  }, [pendingByAgency]);

  // Firestore listener for pending proofs
  useEffect(() => {
    if (!user?.companyId) return;
    let unsubscribers: (() => void)[] = [];

    (async () => {
      try {
        const agencesSnap = await getDocs(
          collection(db, "companies", user.companyId, "agences"),
        );
        agencesSnap.forEach((agenceDoc) => {
          const agencyId = agenceDoc.id;
          const q = query(
            collection(
              db,
              "companies",
              user.companyId,
              "agences",
              agencyId,
              "reservations",
            ),
            where("statut", "==", "preuve_recue"),
          );
          const unsub = onSnapshot(
            q,
            (snap) => {
              setPendingByAgency((prev) => ({
                ...prev,
                [agencyId]: snap.size,
              }));

              snap.docChanges().forEach((change) => {
                if (change.type === "added") {
                  const reservationId = change.doc.id;
                  const key = `${agencyId}_${reservationId}`;
                  const data = change.doc.data() as any;
                  const createdAt = data.createdAt?.toDate?.();

                  if (createdAt && Date.now() - createdAt.getTime() > 30_000) {
                    setPlayedIds((prev) => {
                      const next = new Set(prev);
                      next.add(key);
                      return next;
                    });
                    return;
                  }

                  setPlayedIds((prev) => {
                    if (prev.has(key)) return prev;
                    if (audioRef.current) {
                      try {
                        audioRef.current.currentTime = 0;
                        audioRef.current.play().catch(() => {});
                      } catch {}
                    }
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                  });
                }
              });
            },
            (error) => {
              console.error("[ChefComptable] Listener error:", error);
            },
          );
          unsubscribers.push(unsub);
        });
      } catch (error) {
        console.error("[ChefComptable] Init error:", error);
      }
    })();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user?.companyId]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  // Navigation sections (<=4 → tabs layout)
  const sections: NavSection[] = [
    { label: "Vue Globale", icon: Globe, path: "/chef-comptable", end: true },
    {
      label: "Réservations",
      icon: CreditCard,
      path: "/chef-comptable/reservations-en-ligne",
      badge: pendingCount,
    },
    { label: "Finances", icon: TrendingUp, path: "/chef-comptable/finances" },
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
            <AgencyHeaderExtras isOnline={isOnline} darkMode={darkMode} onDarkModeToggle={toggleDarkMode} />
          }
          mainClassName="agency-content-transition"
        />
      </div>
    </CurrencyProvider>
  );
};

export default ChefComptableCompagniePage;
