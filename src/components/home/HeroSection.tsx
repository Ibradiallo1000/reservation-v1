import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import VilleCombobox from "@/components/VilleCombobox";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [banniereUrl, setBanniereUrl] = useState<string | null>(null);

  // Charger l'image de bannière depuis Firestore
  useEffect(() => {
    const fetchBanner = async () => {
      try {
        const ref = doc(db, "platform", "settings");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          if (data.banniereUrl) {
            setBanniereUrl(data.banniereUrl);
          }
        }
      } catch (err) {
        console.error("Erreur lors du chargement de la bannière:", err);
      }
    };
    fetchBanner();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departure || !arrival) return;
    navigate("/resultats", { state: { departure, arrival } });
  };

  return (
    <section
      className="relative bg-cover bg-center text-white py-32"
      style={{
        backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${
          banniereUrl || "/images/hero-travel.jpg"
        }')`,
      }}
    >
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6">
          Voyagez avec <span className="text-orange-400">Teliya</span>
        </h1>
        <p className="text-lg mb-8">
          Réservez vos billets en ligne, trouvez les meilleurs trajets en Afrique.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white text-gray-800 rounded-lg shadow-lg flex flex-col md:flex-row p-4 gap-4 max-w-3xl mx-auto"
        >
          <VilleCombobox label="Ville de départ" value={departure} onChange={setDeparture} />
          <VilleCombobox label="Ville d’arrivée" value={arrival} onChange={setArrival} />

          <button
            type="submit"
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded flex items-center justify-center"
          >
            <Search className="h-5 w-5 mr-2" /> Rechercher
          </button>
        </form>
      </div>
    </section>
  );
};

export default HeroSection;
