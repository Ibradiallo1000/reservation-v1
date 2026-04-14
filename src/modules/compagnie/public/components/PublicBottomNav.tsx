// src/modules/compagnie/public/components/PublicBottomNav.tsx

import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Ticket, Search, HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

const NAV_HEIGHT = 70;
export const PUBLIC_BOTTOM_NAV_HEIGHT_PX = NAV_HEIGHT;

type TabId =
  | "accueil"
  | "mes-billets"
  | "retrouver-reservation"
  | "aide";

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  pathSuffix: string;
}

const TABS: TabConfig[] = [
  {
    id: "accueil",
    label: "Accueil",
    icon: <Home size={22} />,
    pathSuffix: "",
  },
  {
    id: "mes-billets",
    label: "Mes billets",
    icon: <Ticket size={22} />,
    pathSuffix: "mes-billets",
  },
  {
    id: "retrouver-reservation",
    label: "Reprendre",
    icon: <Search size={22} />,
    pathSuffix: "retrouver-reservation", // ⚠️ on ne change PAS
  },
  {
    id: "aide",
    label: "Aide",
    icon: <HelpCircle size={22} />,
    pathSuffix: "aide",
  },
];

export interface PublicBottomNavProps {
  slug: string | null;
  primaryColor?: string;
  secondaryColor?: string;
}

export default function PublicBottomNav({
  slug,
  primaryColor = "#ea580c",
  secondaryColor = "#ffffff", // fallback
}: PublicBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);

  const pathname = location.pathname;
  const parts = pathname.split("/").filter(Boolean);

  const base = slug ?? parts[0] ?? "";
  const currentSubPath = parts[1] ?? "";

  useEffect(() => {
    const index = TABS.findIndex((tab) => {
      if (tab.id === "accueil") return !currentSubPath;
      return currentSubPath === tab.pathSuffix;
    });
    if (index !== -1) setActiveIndex(index);
  }, [currentSubPath]);

  const handlePress = (tab: TabConfig) => {
    const path = tab.pathSuffix
      ? `/${base}/${tab.pathSuffix}`
      : `/${base}`;
    navigate(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden backdrop-blur-md"
      style={{
        height: NAV_HEIGHT,
        paddingBottom: "env(safe-area-inset-bottom, 0)",
        backgroundColor: "rgba(255,255,255,0.95)",
        boxShadow: "0 -6px 20px rgba(0,0,0,0.08)",
      }}
    >
      <div className="relative h-full flex items-center justify-around">

        {/* BULLE ACTIVE (intégrée à 80%) */}
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="absolute top-[-20%] w-12 h-12 rounded-full shadow-lg"
          style={{
            backgroundColor: primaryColor,
            left: `calc(${(activeIndex + 0.5) * 25}% - 24px)`,
          }}
        />

        {TABS.map((tab, i) => {
          const active = activeIndex === i;

          return (
            <button
              key={tab.id}
              onClick={() => handlePress(tab)}
              className="flex flex-col items-center justify-center flex-1 relative"
            >
              {/* ICON */}
              <span
                className={`transition-all duration-300 ${
                  active ? "-translate-y-3 scale-110" : ""
                }`}
                style={{
                  color: active
                    ? secondaryColor || "#ffffff"
                    : "#6b7280",
                }}
              >
                {tab.icon}
              </span>

              {/* LABEL */}
              <span
                className="text-[11px] mt-1 font-medium"
                style={{
                  color: active ? primaryColor : "#6b7280",
                }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}