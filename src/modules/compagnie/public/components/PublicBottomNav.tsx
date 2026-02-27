// src/modules/compagnie/public/components/PublicBottomNav.tsx
// Navigation basse fixe : Accueil, Mes billets, Réservations, Aide — mobile uniquement
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Ticket, FileText, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

const NAV_HEIGHT = 64; // hauteur barre (px) pour padding-bottom du contenu

export const PUBLIC_BOTTOM_NAV_HEIGHT_PX = NAV_HEIGHT;

type TabId = "accueil" | "mes-billets" | "reservations" | "aide";

interface TabConfig {
  id: TabId;
  labelKey: string;
  icon: React.ReactNode;
  pathSuffix: string; // segment après /:slug ("" = accueil)
}

const TABS: TabConfig[] = [
  { id: "accueil", labelKey: "home", icon: <Home className="w-5 h-5" />, pathSuffix: "" },
  { id: "mes-billets", labelKey: "myTickets", icon: <Ticket className="w-5 h-5" />, pathSuffix: "mes-billets" },
  { id: "reservations", labelKey: "reservations", icon: <FileText className="w-5 h-5" />, pathSuffix: "mes-reservations" },
  { id: "aide", labelKey: "help", icon: <HelpCircle className="w-5 h-5" />, pathSuffix: "aide" },
];

interface PublicBottomNavProps {
  slug: string | null;
  /** Couleur primaire compagnie (optionnel) */
  primaryColor?: string;
}

export default function PublicBottomNav({ slug, primaryColor = "#ea580c" }: PublicBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const parts = pathname.split("/").filter(Boolean);

  // slug = premier segment si on est sous /:slug/...
  const currentSlug = slug ?? parts[0] ?? "";
  const subPath = parts[1] ?? "";

  const isActive = (tab: TabConfig): boolean => {
    if (tab.id === "accueil") return !subPath || subPath === "";
    return subPath === tab.pathSuffix;
  };

  const handlePress = (tab: TabConfig) => {
    if (!currentSlug) return;
    const path = tab.pathSuffix ? `/${currentSlug}/${tab.pathSuffix}` : `/${currentSlug}`;
    navigate(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        height: NAV_HEIGHT,
        paddingBottom: "env(safe-area-inset-bottom, 0)",
        backgroundColor: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        boxShadow: "0 -2px 10px rgba(0,0,0,0.06)",
      }}
    >
      <div className="h-full max-w-lg mx-auto flex items-stretch justify-around">
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handlePress(tab)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 py-2 transition-colors touch-manipulation"
              style={{
                color: active ? primaryColor : "#6b7280",
              }}
              aria-current={active ? "page" : undefined}
              aria-label={t(tab.labelKey)}
            >
              <span className={active ? "opacity-100" : "opacity-70"}>
                {tab.icon}
              </span>
              <span
                className="text-[10px] font-medium truncate w-full text-center"
                style={{ color: active ? primaryColor : "#6b7280" }}
              >
                {t(tab.labelKey)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
