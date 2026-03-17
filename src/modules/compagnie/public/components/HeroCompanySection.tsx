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

  const glassInputClass =
    "bg-white/20 backdrop-blur-sm border border-white/30 [&_svg]:text-white/90";
  const glassInputTextClass =
    "bg-transparent text-white placeholder-white/70 caret-white";

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
            className="mt-6 sm:mt-8 mx-auto max-w-3xl rounded-2xl bg-white/15 backdrop-blur-xl border border-white/20 shadow-2xl p-4 sm:p-5 md:p-6"
          >
            {/* Horizontal layout: [ Départ ] ⇄ [ Arrivée ]; stacked on very small screens */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center">
              <div className="flex-1 min-w-0 flex items-center rounded-2xl bg-white/20 backdrop-blur-sm border border-white/30 shadow-lg min-h-[48px] px-3 py-2">
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
                className="flex-shrink-0 w-12 h-12 sm:w-11 sm:h-11 rounded-full bg-white/25 hover:bg-white/35 border border-white/30 flex items-center justify-center text-white transition shadow-md hover:shadow-lg self-center sm:self-auto"
              >
                <ArrowLeftRight className="h-5 w-5" aria-hidden />
              </button>

              <VilleCombobox
                value={arrival}
                onChange={setArrival}
                placeholder={t("arrivalCity")}
                wrapperClassName={glassInputClass}
                inputClassName={glassInputTextClass}
              />
            </div>

            <div className="mt-4">
              <button
                type="submit"
                disabled={disabled}
                className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-95 shadow-lg"
                style={{
                  backgroundColor: disabled ? "rgba(120,120,120,0.7)" : secondaryColor,
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