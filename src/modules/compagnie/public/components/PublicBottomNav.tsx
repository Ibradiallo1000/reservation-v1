// src/modules/compagnie/public/components/PublicBottomNav.tsx
// Navigation basse fixe : Accueil, Mes billets, Aide - mobile uniquement
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Ticket, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

const NAV_HEIGHT = 64; // hauteur barre (px) pour padding-bottom du contenu

export const PUBLIC_BOTTOM_NAV_HEIGHT_PX = NAV_HEIGHT;

type TabId = "accueil" | "mes-billets" | "aide";

interface TabConfig {
  id: TabId;
  labelKey: string;
  icon: React.ReactNode;
  pathSuffix: string; // segment après /:slug ("" = accueil)
}

const TABS: TabConfig[] = [
  { id: "accueil", labelKey: "home", icon: <Home className="w-5 h-5" />, pathSuffix: "" },
  { id: "mes-billets", labelKey: "myTickets", icon: <Ticket className="w-5 h-5" />, pathSuffix: "mes-billets" },
  { id: "aide", labelKey: "help", icon: <HelpCircle className="w-5 h-5" />, pathSuffix: "aide" },
];

export interface PublicBottomNavProps {
  slug: string | null;
  /** Couleur primaire compagnie (optionnel) */
  primaryColor?: string;
}

export default function PublicBottomNav({ slug, primaryColor = "var(--public-primary)" }: PublicBottomNavProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const parts = pathname.split("/").filter(Boolean);

  const isSub = typeof window !== "undefined" && ((window.location.hostname.endsWith(".teliya.app") && window.location.hostname !== "teliya.app") || (window.location.hostname.endsWith(".localhost") && window.location.hostname !== "localhost"));
  const base = isSub ? "" : (slug ?? parts[0] ?? "");
  const currentSubPath = base === "" ? (parts[0] ?? "") : (parts[1] ?? "");

  const isActive = (tab: TabConfig): boolean => {
    if (tab.id === "accueil") return !currentSubPath || currentSubPath === "";
    return currentSubPath === tab.pathSuffix;
  };

  const handlePress = (tab: TabConfig) => {
    if (base === "" && !slug) return;
    if (base !== "") {
      const path = tab.pathSuffix ? `/${base}/${tab.pathSuffix}` : `/${base}`;
      navigate(path);
    } else {
      const path = tab.pathSuffix ? `/${tab.pathSuffix}` : "/";
      navigate(path);
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-2 md:hidden"
      style={{
        height: NAV_HEIGHT + 10,
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      <div
        className="mx-auto flex h-full max-w-lg items-stretch justify-around overflow-hidden rounded-t-3xl border bg-white/95 backdrop-blur-xl"
        style={{
          borderColor: `color-mix(in srgb, ${primaryColor} 12%, transparent)`,
          boxShadow: `0 -12px 36px color-mix(in srgb, ${primaryColor} 14%, transparent)`,
        }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab);
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handlePress(tab)}
              className="relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-1 px-1 py-2 transition-colors"
              style={{
                color: active ? primaryColor : "var(--public-muted)",
              }}
              aria-current={active ? "page" : undefined}
              aria-label={t(tab.labelKey)}
            >
              {active && (
                <span
                  className="absolute top-0 h-1 w-10 rounded-b-full"
                  style={{ backgroundColor: primaryColor }}
                />
              )}
              <span className={active ? "opacity-100" : "opacity-60"}>
                {tab.icon}
              </span>
              <span
                className="w-full truncate text-center text-[10px] font-bold"
                style={{ color: active ? primaryColor : "var(--public-muted)" }}
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
