// src/modules/compagnie/public/components/HeroCompanySection.tsx
// Hero stable : image full-bleed contrôlée, 2 lignes titre, pas de min-h-screen

import React, { useState } from "react";
import { Search } from "lucide-react";
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

  const disabled =
    !departure ||
    !arrival ||
    departure.toLowerCase() === arrival.toLowerCase();

  const hasBgImage = Boolean(heroImageUrl);

  return (
    <section className="relative w-full pt-[72px]">
      {/* Conteneur image avec hauteur contrôlée */}
      <div className="relative h-[420px] sm:h-[560px] md:h-[900px] overflow-hidden">

        {/* Image ou fond fallback */}
        {hasBgImage ? (
          <>
            <img
              src={heroImageUrl}
              className="absolute inset-0 w-full h-full object-cover"
              alt=""
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/45 dark:bg-black/60 z-0" aria-hidden />
          </>
        ) : (
          <div
            className="absolute inset-0 bg-neutral-900"
            aria-hidden
          />
        )}

        {/* Contenu */}
        <div className="relative z-10 max-w-4xl mx-auto text-center px-4 pt-16 sm:pt-20">

          {/* Ligne 1 */}
          <h1 className="text-2xl sm:text-3xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
            {t("heroTitleWith")}
          </h1>

          {/* Ligne 2 */}
          <h2
            className="mt-2 text-3xl sm:text-4xl font-extrabold truncate text-[color:var(--hero-company-color)] dark:!text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
            style={
              {
                ["--hero-company-color" as string]: secondaryColor,
              } as React.CSSProperties
            }
          >
            {companyName || t("ourCompany")}
          </h2>

          {/* Formulaire */}
          <form
            onSubmit={handleSubmit}
            className="mt-8 mx-auto max-w-3xl rounded-2xl bg-white/20 dark:bg-neutral-900/65 backdrop-blur-md border border-white/30 dark:border-white/15 shadow-2xl p-4 sm:p-5 md:p-6"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">

              <VilleCombobox
                value={departure}
                onChange={setDeparture}
                placeholder={t("departureCity")}
              />

              <VilleCombobox
                value={arrival}
                onChange={setArrival}
                placeholder={t("arrivalCity")}
              />

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={disabled}
                  className="w-full min-h-[44px] inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed hover:opacity-90"
                  style={{
                    backgroundColor: disabled
                      ? "rgba(120,120,120,0.7)"
                      : secondaryColor,
                  }}
                >
                  <Search
                    className="h-5 w-5 mr-2 shrink-0"
                    style={{ color: primaryColor }}
                  />
                  {t("searchTrip")}
                </button>
              </div>

            </div>
          </form>
        </div>
      </div>
    </section>
  );
};

export default HeroCompanySection;