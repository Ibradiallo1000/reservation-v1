// src/components/home/Header.tsx
import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const ORANGE = "#FF6600";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
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
  const goMyBookings = () => { setMenuOpen(false); navigate("/mes-reservations"); };
  const goLogin = () => { setMenuOpen(false); navigate("/login"); };

  return (
    <header className="relative z-50 w-full">
      {/* ===== Bande diagonale orange (style AJ EPIC) ===== */}
      <div className="absolute top-0 left-0 w-full h-[90px] overflow-hidden pointer-events-none select-none">
        <svg viewBox="0 0 1440 200" preserveAspectRatio="none" className="w-full h-full">
          {/* Couche principale orange */}
          <path d="M0,0 L1440,0 L1440,70 C1100,110 600,130 0,50 Z" fill={ORANGE} />
          {/* Reflet léger pour effet glossy */}
          <path
            d="M0,5 L1440,0 L1440,70 C1100,110 600,130 0,50 Z"
            fill="#FFA94D"
            opacity="0.25"
          />
        </svg>
      </div>

      {/* ===== Barre blanche sticky ===== */}
      <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
          {/* Logo + marque */}
          <button onClick={goHome} className="flex items-center gap-2 select-none" aria-label="Accueil Teliya">
            <div className="h-10 w-10 rounded-full bg-white border border-gray-200 overflow-hidden shadow-sm grid place-items-center">
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
            <span className="text-xl md:text-2xl font-extrabold leading-tight" style={{ color: ORANGE }}>
              Teliya
            </span>
          </button>

          {/* Desktop actions */}
          <nav className="hidden md:flex items-center gap-3">
            <button
              onClick={goMyBookings}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-800 border border-gray-300 hover:bg-gray-50 transition"
            >
              🎟 Mes réservations
            </button>
            <button
              onClick={goLogin}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-95 transition"
              style={{ backgroundColor: ORANGE }}
            >
              🔐 Connexion
            </button>
          </nav>

          {/* Mobile toggle */}
          <button
            className="md:hidden inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 text-gray-800"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Ouvrir le menu"
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {/* Menu mobile */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-200 px-4 py-3 space-y-3 bg-white">
            <button
              onClick={goMyBookings}
              className="w-full inline-flex items-center gap-2 px-3 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-800"
            >
              🎟 <span className="font-medium">Mes réservations</span>
            </button>
            <button
              onClick={goLogin}
              className="w-full inline-flex items-center gap-2 px-3 py-3 rounded-lg text-white hover:opacity-95"
              style={{ backgroundColor: ORANGE }}
            >
              🔐 <span className="font-medium">Connexion</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
