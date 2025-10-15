// src/components/home/HeroSection.tsx
import React from "react";
import { Search, ArrowLeftRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import VilleCombobox from "@/components/VilleCombobox";

const HeroSection: React.FC = () => {
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");
  const [spin, setSpin] = React.useState(false);
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const from = departure.trim();
    const to = arrival.trim();
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    navigate("/resultats", { state: { departure: from, arrival: to } });
  };

  const disabled = !departure || !arrival || departure.toLowerCase() === arrival.toLowerCase();
  const swapCities = () => {
    setSpin(true);
    const d = departure;
    setDeparture(arrival);
    setArrival(d);
    setTimeout(() => setSpin(false), 300);
  };

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        // ↓↓↓ 4 CALQUES : voile sombre + image locale + image secours + dégradé sombre
        backgroundImage: `
          linear-gradient(rgba(0,0,0,.68), rgba(0,0,0,.68)),
          url(/images/hero-bus.jpg),
          url(https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1920&q=80),
          linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%)
        `,
        backgroundSize: "cover, cover, cover, cover",
        backgroundPosition: "center, center, center, center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="max-w-5xl mx-auto px-4 py-16 md:py-24 text-center">
        <h1 className="text-3xl md:text-6xl font-extrabold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,.5)]">
          Réservez vos <span className="text-orange-500">trajets</span> en un clic avec{" "}
          <span className="text-orange-500">Teliya</span>
        </h1>

        {/* Carte “verre” */}
        <form
          onSubmit={submit}
          className="mt-4 mx-auto max-w-3xl rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,.5)] p-5 md:p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="text-left">
              <p className="text-xs font-semibold uppercase text-orange-200 mb-1.5">
                Entrée ville de départ
              </p>
              <div className="rounded-xl border border-white/30 bg-white/85 text-gray-900 shadow-md focus-within:ring-2 focus-within:ring-orange-400/80">
                <VilleCombobox value={departure} onChange={setDeparture} placeholder="Ville de départ" />
              </div>
            </div>

            <div className="flex md:block justify-center -mt-1 md:mt-0">
            </div>

            <div className="text-left">
              <p className="text-xs font-semibold uppercase text-orange-200 mb-1.5">
                Entrée ville d’arrivée
              </p>
              <div className="rounded-xl border border-white/30 bg-white/85 text-gray-900 shadow-md focus-within:ring-2 focus-within:ring-orange-400/80">
                <VilleCombobox value={arrival} onChange={setArrival} placeholder="Ville d’arrivée" />
              </div>
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={disabled}
                className={`w-full inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white shadow-[0_10px_20px_rgba(255,102,0,.35)] transition
                  ${disabled ? "bg-orange-300/70 cursor-not-allowed" : "bg-gradient-to-r from-orange-600 to-orange-500 hover:brightness-110"}`}
              >
                <Search className="h-5 w-5 mr-2" />
                Rechercher
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* dégradé en bas pour fondre la section suivante */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />
    </section>
  );
};

export default HeroSection;
