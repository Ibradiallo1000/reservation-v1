import React from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import VilleCombobox from "@/components/VilleCombobox";

const HeroSection: React.FC = () => {
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const from = (departure || "").trim();
    const to = (arrival || "").trim();
    if (!from || !to) return;
    if (from.toLowerCase() === to.toLowerCase()) return;
    navigate("/resultats", { state: { departure: from, arrival: to } });
  };

  return (
    <section
      className="relative text-white py-24 md:py-32"
      style={{
        background: `
          radial-gradient(circle at top left, rgba(249,115,22,0.25), transparent 60%),
          radial-gradient(circle at bottom right, rgba(255,102,0,0.25), transparent 70%),
          linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%)
        `,
      }}
    >
      <div className="max-w-4xl mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
          Voyagez avec <span className="text-orange-500">Teliya</span>
        </h1>
        <p className="text-lg mb-8 text-gray-200">
          Réservez vos billets en ligne, trouvez les meilleurs trajets en Afrique.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white text-gray-800 rounded-lg shadow-xl flex flex-col md:flex-row p-4 gap-4 max-w-3xl mx-auto"
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
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded flex items-center justify-center transition-colors duration-200"
          >
            <Search className="h-5 w-5 mr-2" /> Rechercher
          </button>
        </form>
      </div>
    </section>
  );
};

export default HeroSection;
