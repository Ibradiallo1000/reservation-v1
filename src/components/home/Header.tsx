import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebaseConfig";
import ProgressiveImg from "@/components/ui/ProgressiveImg";

const HEADER_H = "64px";

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "platform", "settings"));
        setLogoUrl(snap.exists() ? (snap.data().logoUrl ?? null) : null);
      } catch (e) {
        console.warn("Logo non chargé:", e);
      }
    })();
  }, []);

  return (
    <header
      className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-orange-100"
      style={{ height: HEADER_H }}
      aria-label="En-tête Teliya"
    >
      <div className="max-w-7xl h-full mx-auto px-4 flex items-center justify-between">
        {/* Logo + marque */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2" aria-label="Accueil Teliya">
          <div className="h-10 w-10 rounded-full bg-white border-2 border-orange-600 flex items-center justify-center overflow-hidden">
            <ProgressiveImg
              src={logoUrl || "/images/logo.png"}
              placeholderSrc="/images/logo-mini.png"
              width={28}
              height={28}
              className="h-7 w-7 object-contain"
              alt="Logo Teliya"
            />
          </div>
          <span className="text-2xl font-extrabold text-orange-600 tracking-wide">Teliya</span>
        </button>

        {/* Desktop */}
        <nav className="hidden md:flex items-center gap-6" aria-label="Navigation principale">
          <button onClick={() => navigate("/resultats")} className="text-gray-700 hover:text-orange-600">Trajets</button>
          <button onClick={() => navigate("/destinations")} className="text-gray-700 hover:text-orange-600">Destinations</button>
          <button onClick={() => navigate("/login")} className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">Connexion</button>
        </nav>

        {/* Mobile */}
        <button className="md:hidden text-gray-700" onClick={() => setMenuOpen(v => !v)} aria-label="Ouvrir le menu">
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden bg-white border-t border-orange-100 px-4 py-3 space-y-3">
          <button onClick={() => { navigate("/resultats"); setMenuOpen(false); }} className="block text-left hover:text-orange-600">Trajets</button>
          <button onClick={() => { navigate("/destinations"); setMenuOpen(false); }} className="block text-left hover:text-orange-600">Destinations</button>
          <button onClick={() => { navigate("/login"); setMenuOpen(false); }} className="block text-left bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">Connexion</button>
        </div>
      )}
    </header>
  );
};

export default Header;
