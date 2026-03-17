// src/modules/compagnie/public/components/HeroCompanySection.tsx
// Hero: unified horizontal search bar with swap, glass style, responsive

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

  /* Inputs: frosted glass (lisible) + texte bien contrasté */
  const glassInputClass =
    "bg-white/50 backdrop-blur-md border border-white/40 rounded-2xl shadow-[inset_0_1px_0_0_rgba(255,255,255,0.3)] [&_svg]:text-gray-700 px-4 py-3 min-h-[48px]";
  const glassInputTextClass =
    "bg-transparent text-gray-900 font-semibold text-base placeholder-gray-700 caret-gray-900 min-w-0 [text-shadow:0_1px_2px_rgba(255,255,255,0.9)]";

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
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/35 to-black/10 z-0" aria-hidden />
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

          <form
            onSubmit={handleSubmit}
            className="mt-6 sm:mt-8 mx-auto max-w-3xl rounded-2xl bg-white/5 backdrop-blur-xl border border-white/20 shadow-2xl p-4 sm:p-5 md:p-6"
          >
            {/* ALWAYS horizontal: [ Départ ] ⇄ [ Arrivée ] */}
            <div className="flex flex-row items-stretch gap-2 sm:gap-3 w-full min-w-0">
              <div className="flex-1 min-w-0 flex items-center">
                <VilleCombobox
                  value={departure}
                  onChange={setDeparture}
                  placeholder={t("departureCity")}
                  wrapperClassName={glassInputClass}
                  inputClassName={glassInputTextClass}
                />
              </div>

              <button
                type="button"
                onClick={handleSwap}
                aria-label={t("swapCities")}
                className="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/30 border border-white/30 flex items-center justify-center text-white transition shadow-lg hover:shadow-xl"
              >
                <ArrowLeftRight className="h-5 w-5" aria-hidden />
              </button>

              <div className="flex-1 min-w-0 flex items-center">
                <VilleCombobox
                  value={arrival}
                  onChange={setArrival}
                  placeholder={t("arrivalCity")}
                  wrapperClassName={glassInputClass}
                  inputClassName={glassInputTextClass}
                />
              </div>
            </div>

            <div className="mt-4 sm:mt-5">
              <button
                type="submit"
                disabled={disabled}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-white text-base transition disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-95 shadow-lg border border-white/20"
                style={{
                  backgroundColor: disabled ? "rgba(100,100,100,0.8)" : secondaryColor,
                }}
              >
                <Search className="h-5 w-5 shrink-0" style={{ color: primaryColor }} aria-hidden />
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