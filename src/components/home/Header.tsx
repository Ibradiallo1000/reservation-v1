import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from '../../firebaseConfig';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Charger le logo depuis Firestore (platform/settings)
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const ref = doc(db, "platform", "settings");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.logoUrl) setLogoUrl(data.logoUrl);
        }
      } catch (err) {
        console.error("Erreur chargement logo:", err);
      }
    };
    fetchLogo();
  }, []);

  return (
    <header className="bg-white/90 backdrop-blur-md shadow-md sticky top-0 z-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        
        {/* Logo dynamique + texte Teliya */}
        <div 
          className="flex items-center cursor-pointer"
          onClick={() => navigate("/")}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo Teliya" className="h-8 w-auto mr-2" />
          ) : (
            <img src="/images/logo.png" alt="Logo Teliya" className="h-8 w-auto mr-2" />
          )}
          <span className="text-3xl font-extrabold text-orange-600 tracking-wide">
            Teliya
          </span>
        </div>

        {/* Menu Desktop */}
        <nav className="space-x-6 hidden md:flex">
          <button onClick={() => navigate("/resultats")} className="text-gray-700 hover:text-orange-600">
            Trajets
          </button>
          <button onClick={() => navigate("/destinations")} className="text-gray-700 hover:text-orange-600">
            Destinations
          </button>
          <button 
            onClick={() => navigate("/login")} 
            className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
          >
            Connexion
          </button>
        </nav>

        {/* Menu Mobile */}
        <button 
          className="md:hidden text-gray-700 focus:outline-none"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Dropdown Mobile */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 px-4 py-3 space-y-3">
          <button onClick={() => { navigate("/resultats"); setMenuOpen(false); }} className="block w-full text-left hover:text-orange-600">
            Trajets
          </button>
          <button onClick={() => { navigate("/destinations"); setMenuOpen(false); }} className="block w-full text-left hover:text-orange-600">
            Destinations
          </button>
          <button onClick={() => { navigate("/login"); setMenuOpen(false); }} className="block w-full text-left bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">
            Connexion
          </button>
        </div>
      )}
    </header>
  );
};

export default Header;
