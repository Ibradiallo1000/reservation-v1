// src/components/home/Header.tsx
import React, { useEffect, useState } from "react";
import { Ticket, Sun, Moon, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const ORANGE = "#FF6600";
const ORANGE_DARK = "#E55400";

type Theme = "light" | "dark" | "system";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem("teliya:lastLogoUrl");
    } catch {
      return null;
    }
  });
  const [logoLoaded, setLogoLoaded] = useState(false);

  // ---------- GESTION THÈME ----------
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("teliya:theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  const prefersDark =
    typeof window !== "undefined"
      ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
      : false;
  const isDark = theme === "system" ? prefersDark : theme === "dark";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    try {
      localStorage.setItem("teliya:theme", theme);
    } catch {}
  }, [theme, isDark]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        document.documentElement.classList.toggle("dark", mq.matches);
      }
    };
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, [theme]);

  // ---------- CHARGEMENT LOGO ----------
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "platform", "settings"))
      .then((snap) => {
        const url = snap.exists() ? (snap.data() as any)?.logoUrl : null;
        if (!cancelled && url) {
          setLogoUrl(url);
          try {
            localStorage.setItem("teliya:lastLogoUrl", url);
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const goHome = () => navigate("/");
  const goLogin = () => navigate("/login");
  const goBookings = () => navigate("/mes-reservations");

  const cycleTheme = () => {
    setTheme((t) =>
      t === "system" ? "dark" : t === "dark" ? "light" : "system"
    );
  };

  return (
    <header className="relative z-50 w-full">
      {/* Barre principale orange */}
      <div
        className="fixed top-0 inset-x-0 z-50 shadow-md border-b border-orange-700/30"
        style={{
          background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_DARK})`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2 text-white">
          {/* Logo + nom */}
          <button
            onClick={goHome}
            className="flex items-center gap-2 select-none"
            aria-label="Accueil Teliya"
          >
            <div className="h-8 w-8 rounded-full bg-white/10 border border-white/20 overflow-hidden shadow-sm grid place-items-center">
              {!logoLoaded && (
                <div className="w-6 h-6 rounded-full bg-white/20 animate-pulse" />
              )}
              <img
                src={logoUrl || "/images/teliya-logo.jpg"}
                alt="Logo Teliya"
                width={40}
                height={40}
                className={`w-full h-full object-contain ${
                  logoLoaded ? "" : "opacity-0"
                }`}
                loading="eager"
                decoding="async"
                onLoad={() => setLogoLoaded(true)}
              />
            </div>
            <span className="text-xl md:text-2xl font-extrabold leading-tight">
              Teliya
            </span>
          </button>

          {/* Lien Mes Réservations */}
          <button
            onClick={goBookings}
            className="ml-3 inline-flex items-center gap-1.5 text-sm md:text-base font-semibold text-white/90 hover:text-white transition"
            aria-label="Voir mes réservations"
            title="Voir mes réservations"
          >
            <Ticket className="h-5 w-5" />
            <span>Mes réservations</span>
          </button>

          <div className="flex-1" />

          {/* Actions à droite : thème + connexion */}
          <div className="flex items-center gap-2">
            <button
              onClick={cycleTheme}
              className="h-8 w-8 rounded-full grid place-items-center ring-1 ring-white/20 hover:bg-white/10"
              aria-label={`Thème: ${theme}`}
              title={
                theme === "system"
                  ? "Thème automatique"
                  : isDark
                  ? "Thème sombre"
                  : "Thème clair"
              }
            >
              {isDark ? (
                <Moon className="h-5 w-5 text-white" />
              ) : (
                <Sun className="h-5 w-5 text-white" />
              )}
            </button>

            <button
              onClick={goLogin}
              className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-white text-orange-600 hover:scale-105 transition-transform"
              aria-label="Connexion"
              title="Connexion"
            >
              <User className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
