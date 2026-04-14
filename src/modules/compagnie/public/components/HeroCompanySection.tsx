// HeroCompanySection.tsx

import React, { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import VilleCombobox from "@/shared/ui/VilleCombobox";

export interface HeroCompanySectionProps {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  heroImageUrl?: string;
  onSearch: (departure: string, arrival: string) => void;
}

const HeroCompanySection: React.FC<HeroCompanySectionProps> = ({
  companyName,
  primaryColor,
  secondaryColor,
  heroImageUrl,
  onSearch,
}) => {
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departure || !arrival || departure === arrival) return;
    onSearch(departure, arrival);
  };

  const handleSwap = () => {
    setDeparture(arrival);
    setArrival(departure);
  };

  const disabled =
    !departure || !arrival || departure.toLowerCase() === arrival.toLowerCase();

  return (
    <section className="relative w-full">
      <div className="relative h-[420px] sm:h-[500px] md:h-[560px] overflow-hidden">

        {/* IMAGE */}
        <img
          src={heroImageUrl}
          className="absolute inset-0 w-full h-full object-cover"
          alt=""
        />

        {/* OVERLAY (plus propre) */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/30" />

        {/* CONTENU */}
        <div className="relative z-10 max-w-3xl mx-auto px-4 pt-24 text-center">

          <h1
            className="text-lg sm:text-xl font-medium drop-shadow-[0_3px_8px_rgba(0,0,0,0.9)]"
            style={{ color: secondaryColor }}
          >
            {t("heroTitleWith")}
          </h1>

          <h2 className="mt-1 text-2xl sm:text-3xl font-bold drop-shadow-[0_3px_10px_rgba(0,0,0,0.9)]">
            <span style={{ color: secondaryColor }}>
              {companyName}
            </span>
          </h2>

          {/* SEARCH */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3 shadow-xl"
          >
            <div className="flex items-center gap-2">

              <div className="flex-1">
                <VilleCombobox
                  value={departure}
                  onChange={setDeparture}
                  placeholder={t("depart")}
                  showLocationIcon
                  wrapperClassName="bg-white rounded-xl px-3 py-2 shadow-sm"
                  inputClassName="text-gray-800 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={handleSwap}
                className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
              >
                <ArrowLeftRight className="w-4 h-4 text-white" />
              </button>

              <div className="flex-1">
                <VilleCombobox
                  value={arrival}
                  onChange={setArrival}
                  placeholder={t("arrival")}
                  showLocationIcon
                  wrapperClassName="bg-white rounded-xl px-3 py-2 shadow-sm"
                  inputClassName="text-gray-800 text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={disabled}
              className="mt-3 w-full py-3 rounded-xl text-white font-semibold transition"
              style={{
                backgroundColor: disabled ? "#999" : primaryColor,
              }}
            >
              {t("searchTrip")}
            </button>
          </form>
        </div>

        {/* 🔥 COURBE PRO (sans trait + plus naturelle) */}
        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none pointer-events-none">
          <svg
            viewBox="0 0 500 100"
            preserveAspectRatio="none"
            className="w-full h-[130px]"
          >
            <path
              d="M0,60 C150,110 350,10 500,60 L500,100 L0,100 Z"
              fill="#f9fafb"
            />
          </svg>
        </div>

      </div>
    </section>
  );
};

export default HeroCompanySection;