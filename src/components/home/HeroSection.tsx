import React, { useEffect, useRef } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import VilleCombobox from "@/components/VilleCombobox";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const HeroSection: React.FC = () => {
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival]   = React.useState("");
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null);
  const bannerRef = useRef<HTMLImageElement | null>(null);
  const navigate = useNavigate();

  // Récupère la bannière et précharge
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, "platform", "settings"));
        const url = snap.exists() ? (snap.data() as any)?.banniereUrl : null;
        if (url) {
          const l = document.createElement("link");
          l.rel = "preload";
          l.as = "image";
          l.href = url;
          l.setAttribute("fetchpriority", "high");
          document.head.appendChild(l);
          setBannerUrl(url);
        }
      } catch (e) {
        console.warn("[Hero] impossible de charger la bannière", e);
      }
    })();
  }, []);

  // Applique fetchpriority en lowercase via setAttribute (pas de prop React)
  useEffect(() => {
    if (bannerRef.current) {
      try { bannerRef.current.setAttribute("fetchpriority", "high"); } catch {}
    }
  }, [bannerUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const from = (departure || "").trim();
    const to   = (arrival || "").trim();

    console.debug("[SEARCH submit]", { from, to });

    if (!from || !to) return;
    if (from.toLowerCase() === to.toLowerCase()) return;

    // ✅ Navigation via state (compatible avec ta page résultats existante)
    navigate("/resultats", {
      state: { departure: from, arrival: to }
    });

    // (Optionnel) Si tu veux aussi une URL partageable, dé-commente :
    // const qs = new URLSearchParams({ from, to }).toString();
    // navigate({ pathname: "/resultats", search: `?${qs}`, state: { departure: from, arrival: to } });
  };

  return (
    <section
      className="relative bg-cover bg-center text-white py-32"
      style={{
        backgroundImage: bannerUrl
          ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('${bannerUrl}')`
          : undefined,
      }}
    >
      {bannerUrl && (
        <img
          ref={bannerRef}
          src={bannerUrl}
          alt="Bannière"
          className="hidden"
          loading="eager"
          decoding="async"
        />
      )}

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
          <VilleCombobox
            label="Ville de départ"
            value={departure}
            onChange={setDeparture}
          />
          <VilleCombobox
            label="Ville d’arrivée"
            value={arrival}
            onChange={setArrival}
          />

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
