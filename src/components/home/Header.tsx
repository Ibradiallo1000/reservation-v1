// src/components/home/Header.tsx
import React, { useEffect, useState } from "react";
import { Menu, X, Ticket, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // cache local pour afficher un logo même offline / lenteur Firestore
  const [logoUrl, setLogoUrl] = useState<string | null>(() => {
    try { return localStorage.getItem("teliya:lastLogoUrl"); } catch { return null; }
  });
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "platform", "settings"));
        const url = snap.exists() ? (snap.data() as any)?.logoUrl : null;
        if (!cancelled && url) {
          setLogoUrl(url);
          try { localStorage.setItem("teliya:lastLogoUrl", url); } catch {}
          // précharge délicatement (sans warning React)
          const l = document.createElement("link");
          l.rel = "preload";
          l.as = "image";
          l.href = url;
          l.setAttribute("fetchpriority", "high");
          document.head.appendChild(l);
          setTimeout(() => { try { document.head.removeChild(l); } catch {} }, 4000);
        }
      } catch {
        // silencieux : on reste sur le cache/fallback
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const goHome = () => navigate("/");
  const goMyBookings = () => { setMenuOpen(false); navigate("/mes-reservations"); };
  const goLogin = () => { setMenuOpen(false); navigate("/login"); };

  return (
    <header className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <button onClick={goHome} className="flex items-center gap-2" aria-label="Accueil Teliya">
          {/* pastille ronde, anneau blanc fin, sans flash */}
          <div className="h-9 w-9 rounded-full bg-white ring-2 ring-white border border-orange-500/20 overflow-hidden grid place-items-center">
            {!logoLoaded && <div className="w-4.5 h-4.5 rounded-full bg-gray-200 animate-pulse" />}
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo Teliya"
                width={36}
                height={36}
                className={`w-9 h-9 object-contain rounded-full ${logoLoaded ? "" : "opacity-0"}`}
                loading="eager"
                decoding="async"
                onLoad={() => setLogoLoaded(true)}
              />
            ) : (
              <img
                src="/images/teliya-logo.jpg"
                alt="Logo Teliya"
                width={36}
                height={36}
                className="w-9 h-9 object-contain rounded-full"
                loading="eager"
                decoding="async"
              />
            )}
          </div>
          <span className="text-2xl font-extrabold text-orange-600 tracking-wide">
            Teliya
          </span>
        </button>

        {/* --- Desktop actions --- */}
        <nav className="hidden md:flex items-center gap-3">
          <button
            onClick={goMyBookings}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 hover:bg-gray-50"
            title="Retrouver mes réservations"
          >
            <Ticket className="w-4 h-4 text-orange-600" />
            Mes réservations
          </button>
          <button
            onClick={goLogin}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
            title="Se connecter"
          >
            <LogIn className="w-4 h-4" />
            Connexion
          </button>
        </nav>

        {/* --- Mobile toggle --- */}
        <button
          className="md:hidden inline-flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 text-gray-700"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Ouvrir le menu"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* --- Mobile menu --- */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 px-4 py-3 space-y-3">
          <button
            onClick={goMyBookings}
            className="w-full inline-flex items-center gap-2 px-3 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 text-left"
          >
            <Ticket className="w-4 h-4 text-orange-600" />
            <span className="font-medium">Mes réservations</span>
          </button>

          <button
            onClick={goLogin}
            className="w-full inline-flex items-center gap-2 px-3 py-3 rounded-lg bg-orange-600 text-white hover:bg-orange-700 text-left"
          >
            <LogIn className="w-4 h-4" />
            <span className="font-medium">Connexion</span>
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;
