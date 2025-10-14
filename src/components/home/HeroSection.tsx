import React from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import VilleCombobox from "@/components/VilleCombobox";

const HeroSection: React.FC = () => {
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const from = departure.trim();
    const to = arrival.trim();
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    navigate("/resultats", { state: { departure: from, arrival: to } });
  };

  const disabled = !departure || !arrival || departure.toLowerCase() === arrival.toLowerCase();

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(60% 80% at 15% 10%, rgba(255,102,0,.18), transparent 60%), radial-gradient(50% 70% at 85% 20%, rgba(249,115,22,.16), transparent 60%), linear-gradient(180deg,#121212 0%, #1b1b1b 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
        {/* ✅ nouveau wording : plateforme + voyages interurbains */}
        <h1 className="text-3xl md:text-6xl font-extrabold tracking-tight text-white">
          Réservez vos <span className="text-orange-500">trajets</span> interurbains avec <span className="text-orange-500">Teliya</span>
        </h1>
        <p className="mt-4 text-gray-200/90 text-lg">
          La plateforme qui regroupe les compagnies <span className="font-semibold">locales</span> : comparez les horaires et réservez en quelques clics.
        </p>

        {/* carte “verre” */}
        <form
          onSubmit={submit}
          className="mt-8 mx-auto max-w-3xl flex flex-col md:flex-row gap-4
                     rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md
                     shadow-[0_10px_30px_rgba(0,0,0,.35)] p-4"
        >
          <VilleCombobox value={departure} onChange={setDeparture} placeholder="Ville de départ" />
          <VilleCombobox value={arrival} onChange={setArrival} placeholder="Ville d’arrivée" />
          <button
            type="submit"
            disabled={disabled}
            className={`inline-flex items-center justify-center px-6 py-2 rounded-xl font-semibold text-white
              ${disabled ? "bg-orange-300/60 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"}
            `}
          >
            <Search className="h-5 w-5 mr-2" />
            Rechercher
          </button>
        </form>
      </div>

      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
    </section>
  );
};

export default HeroSection;
