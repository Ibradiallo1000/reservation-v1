import React, { useEffect, useState } from "react";
import { Ticket, Sun, Moon, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const ORANGE = "#FF6600";
const ORANGE_LIGHT = "#FF944D";

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

  /* ---------- GESTION THÈME (auto + override) ---------- */
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("teliya:theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  const prefersDark = typeof window !== "undefined"
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

  /* ---------- CHARGEMENT LOGO ---------- */
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
    setTheme((t) => (t === "system" ? "dark" : t === "dark" ? "light" : "system"));
  };

  return (
    <header className="relative z-50 w-full">
      {/* Bande diagonale décorative */}
      <div className="absolute top-0 left-0 w-full h-[90px] overflow-hidden pointer-events-none select-none">
        <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 L1440,0 L1440,70 C1100,110 600,130 0,50 Z" fill={ORANGE} />
          <path
            d="M0,5 L1440,0 L1440,70 C1100,110 600,130 0,50 Z"
            fill={ORANGE_LIGHT}
            opacity="0.35"
          />
        </svg>
      </div>

      {/* Barre principale (fond blanc comme avant) */}
      <div className="fixed top-0 inset-x-0 bg-white/95 dark:bg-gray-900/90 backdrop-blur border-b border-gray-100 dark:border-white/10 shadow-sm z-50">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center gap-2">
          {/* Logo + nom */}
          <button
            onClick={goHome}
            className="flex items-center gap-2 select-none"
            aria-label="Accueil Teliya"
          >
            <div className="h-8 w-8 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/10 overflow-hidden shadow-sm grid place-items-center">
              {!logoLoaded && (
                <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
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
            <span
              className="text-xl md:text-2xl font-extrabold leading-tight"
              style={{ color: ORANGE }}
            >
              Teliya
            </span>
          </button>

          {/* Lien Mes Réservations — pas de fond, texte orange */}
          <button
            onClick={goBookings}
            className="ml-4 inline-flex items-center gap-1.5 text-2sm md:text-base font-semibold text-orange-600 hover:text-orange-700 transition"
            aria-label="Voir mes réservations"
            title="Voir mes réservations"
          >
            <Ticket className="h-7 w-7" />
            <span>Mes réservations</span>
          </button>

          <div className="flex-1" />

          {/* Actions à droite : thème + connexion */}
          <div className="flex items-center gap-2">
            <button
              onClick={cycleTheme}
              className="h-8 w-8 rounded-full grid place-items-center ring-1 ring-black/10 dark:ring-white/10 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label={`Thème: ${theme}`}
              title={
                theme === "system"
                  ? "Thème: Auto (système)"
                  : isDark
                  ? "Thème: Sombre"
                  : "Thème: Clair"
              }
            >
              {isDark ? (
                <Moon className="h-5 w-5 text-white" />
              ) : (
                <Sun className="h-5 w-5 text-gray-900" />
              )}
            </button>

            <button
              onClick={goLogin}
              className="inline-flex items-center justify-center h-8 w-8 rounded-full shadow-md transition transform hover:scale-105 hover:shadow-lg ring-1 ring-black/10 dark:ring-white/10 bg-white dark:bg-gray-800"
              style={{ color: ORANGE }}
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
