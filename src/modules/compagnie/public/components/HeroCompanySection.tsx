// src/modules/compagnie/public/components/HeroCompanySection.tsx
// Design exact maquette : glassmorphism conteneur, champs ville blancs + MapPin, bouton swap glass, bouton recherche glass rouge.

import React, { useState } from "react";
import { Search, ArrowLeftRight } from "lucide-react";
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
    const from = departure.trim();
    const to = arrival.trim();
    if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
    onSearch(from, to);
  };

  const handleSwap = () => {
    setDeparture(arrival);
    setArrival(departure);
  };

  const disabled =
    !departure ||
    !arrival ||
    departure.toLowerCase() === arrival.toLowerCase();

  const hasBgImage = Boolean(heroImageUrl);

  /* Champs ville : fond BLANC solide, bordure gris clair, icône MapPin (design maquette) */
  const cityInputWrapper =
    "bg-white border border-gray-200 rounded-xl px-4 py-3 min-h-[48px] shadow-sm";
  const cityInputText =
    "text-gray-800 font-medium placeholder-gray-500 bg-transparent";

  return (
    <section className="relative w-full min-w-0">
      <div className="relative h-[380px] sm:h-[480px] md:h-[560px] lg:h-[600px] overflow-hidden">
        {hasBgImage ? (
          <>
            <img
              src={heroImageUrl}
              className="absolute inset-0 w-full h-full object-cover object-center"
              alt=""
              aria-hidden
            />
            <div
              className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/20 z-0"
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-neutral-900" aria-hidden />
        )}

        <div className="public-hero-titles relative z-10 max-w-4xl mx-auto text-center px-4 sm:px-6 pt-20 sm:pt-24">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-medium text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]">
            {t("heroTitleWith")}
          </h1>
          <h2 className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
            {companyName || t("ourCompany")}
          </h2>

          {/* Conteneur unique glassmorphism : translucide, blur, dégradé léger, coins très arrondis */}
          <form
            onSubmit={handleSubmit}
            className="mt-6 sm:mt-8 mx-auto max-w-3xl rounded-3xl shadow-2xl p-4 sm:p-5 md:p-6 border border-white/25 bg-black/20 backdrop-blur-xl bg-gradient-to-b from-gray-900/40 to-gray-900/25"
          >
            <div className="flex flex-row items-stretch gap-3 w-full min-w-0">
              <div className="flex-1 min-w-0 flex items-center">
                <VilleCombobox
                  value={departure}
                  onChange={setDeparture}
                  placeholder={t("depart")}
                  showLocationIcon
                  wrapperClassName={cityInputWrapper}
                  inputClassName={cityInputText}
                />
              </div>

              {/* Bouton swap : circulaire, glass, icône gris foncé */}
              <button
                type="button"
                onClick={handleSwap}
                aria-label={t("swapCities")}
                className="flex-shrink-0 w-12 h-12 rounded-full border border-gray-300/80 bg-white/20 backdrop-blur-md hover:bg-white/30 flex items-center justify-center transition"
              >
                <ArrowLeftRight className="h-5 w-5 text-gray-700" aria-hidden />
              </button>

              <div className="flex-1 min-w-0 flex items-center">
                <VilleCombobox
                  value={arrival}
                  onChange={setArrival}
                  placeholder={t("arrival")}
                  showLocationIcon
                  wrapperClassName={cityInputWrapper}
                  inputClassName={cityInputText}
                />
              </div>
            </div>

            {/* Bouton recherche : glass teinté rouge, icône rouge, texte blanc gras */}
            <div className="mt-4 sm:mt-5">
              <button
                type="submit"
                disabled={disabled}
                className="w-full min-h-[52px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold text-white text-base transition disabled:opacity-60 disabled:cursor-not-allowed border border-white/30 shadow-lg backdrop-blur-md hover:opacity-95"
                style={{
                  backgroundColor: disabled
                    ? "rgba(100,100,100,0.6)"
                    : `${primaryColor}cc`,
                }}
              >
                <Search
                  className="h-5 w-5 shrink-0"
                  style={{ color: primaryColor }}
                  aria-hidden
                />
                {t("searchTrip")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default HeroCompanySection;
