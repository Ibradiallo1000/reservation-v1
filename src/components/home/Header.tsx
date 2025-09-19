// src/components/home/Header.tsx
import React, { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
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
          // nettoyage plus tard
          setTimeout(() => { try { document.head.removeChild(l); } catch {} }, 4000);
        }
      } catch {
        // silencieux : on reste sur le cache/fallback
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <header className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <button onClick={() => navigate("/")} className="flex items-center gap-2">
          {/* pastille ronde, anneau blanc fin, sans flash */}
          <div className="h-9 w-9 rounded-full bg-white ring-2 ring-white border border-orange-500/20 overflow-hidden grid place-items-center">
            {!logoLoaded && (
              <div className="w-4.5 h-4.5 rounded-full bg-gray-200 animate-pulse" />
            )}
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

        <nav className="hidden md:flex items-center gap-6">
          <button onClick={() => navigate("/resultats")} className="text-gray-700 hover:text-orange-600">Trajets</button>
          <button onClick={() => navigate("/destinations")} className="text-gray-700 hover:text-orange-600">Destinations</button>
          <button onClick={() => navigate("/login")} className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">Connexion</button>
        </nav>

        <button className="md:hidden text-gray-700" onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X className="h-6 w-6"/> : <Menu className="h-6 w-6"/>}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 px-4 py-3 space-y-3">
          <button onClick={() => { navigate("/resultats"); setMenuOpen(false); }} className="block w-full text-left hover:text-orange-600">Trajets</button>
          <button onClick={() => { navigate("/destinations"); setMenuOpen(false); }} className="block w-full text-left hover:text-orange-600">Destinations</button>
          <button onClick={() => { navigate("/login"); setMenuOpen(false); }} className="block w-full text-left bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">Connexion</button>
        </div>
      )}
    </header>
  );
};

export default Header;
