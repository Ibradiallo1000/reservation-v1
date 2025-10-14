// src/components/home/Header.tsx
import React, { useEffect, useState } from "react";
import { User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const ORANGE = "#FF6600";
const ORANGE_LIGHT = "#FF944D";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem("teliya:lastLogoUrl"); } catch { return null; }
  });
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "platform", "settings"))
      .then((snap) => {
        const url = snap.exists() ? (snap.data() as any)?.logoUrl : null;
        if (!cancelled && url) {
          setLogoUrl(url);
          try { localStorage.setItem("teliya:lastLogoUrl", url); } catch {}
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const goHome = () => navigate("/");
  const goLogin = () => navigate("/login");

  return (
    <header className="relative z-50 w-full">
      {/* ===== Bande diagonale orange ===== */}
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

      {/* ===== Barre principale ===== */}
      <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          {/* Logo + nom */}
          <button
            onClick={goHome}
            className="flex items-center gap-2 select-none"
            aria-label="Accueil Teliya"
          >
            <div className="h-8 w-8 rounded-full bg-white border border-gray-200 overflow-hidden shadow-sm grid place-items-center">
              {!logoLoaded && <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />}
              <img
                src={logoUrl || "/images/teliya-logo.jpg"}
                alt="Logo Teliya"
                width={40}
                height={40}
                className={`w-full h-full object-contain ${logoLoaded ? "" : "opacity-0"}`}
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

          {/* ===== Bouton Connexion stylé orange ===== */}
          <button
            onClick={goLogin}
            className="inline-flex items-center justify-center h-8 w-8 rounded-full shadow-md transition transform hover:scale-105 hover:shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_LIGHT} 100%)`,
              color: "white",
            }}
            aria-label="Connexion"
            title="Connexion"
          >
            <User className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
