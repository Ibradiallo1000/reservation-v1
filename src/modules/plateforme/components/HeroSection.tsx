// src/modules/public/components/home/HeroSection.tsx

import React from "react";
import { Search } from "lucide-react";
import VilleCombobox from "@/shared/ui/VilleCombobox";
import type { Company } from "@/types/companyTypes";

interface HeroSectionProps {
  company?: any;
  onSearch: (departure: string, arrival: string) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ company, onSearch }) => {
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();

    const from = departure.trim();
    const to = arrival.trim();

    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;

    onSearch(from, to); // ✅ on délègue au parent
  };

  const disabled =
    !departure ||
    !arrival ||
    departure.toLowerCase() === arrival.toLowerCase();

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        backgroundImage: `
          linear-gradient(rgba(0,0,0,.68), rgba(0,0,0,.68)),
          url(/images/hero-bus.jpg),
          linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%)
        `,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="max-w-5xl mx-auto px-2 py-8 md:py-24 text-center">
        <h1 className="text-3xl md:text-6xl font-extrabold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,.5)]">
          Réservez vos <span className="text-orange-500">trajets</span> avec{" "}
          <span className="text-orange-500">
            {company?.nom || "Teliya"}
          </span>
        </h1>

        <form
          onSubmit={submit}
          className="mt-6 mx-auto max-w-3xl rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-lg p-5 md:p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <VilleCombobox
                value={departure}
                onChange={setDeparture}
                placeholder="Ville de départ"
              />
            </div>

            <div>
              <VilleCombobox
                value={arrival}
                onChange={setArrival}
                placeholder="Ville d’arrivée"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={disabled}
                className={`w-full inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white transition
                  ${
                    disabled
                      ? "bg-orange-300/70 cursor-not-allowed"
                      : "bg-gradient-to-r from-orange-600 to-orange-500 hover:brightness-110"
                  }`}
              >
                <Search className="h-5 w-5 mr-2" />
                Rechercher
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};

export default HeroSection;
