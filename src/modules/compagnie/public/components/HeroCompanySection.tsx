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
    <section className="relative w-full">
      {/* Image full bleed top, overlay, content on top */}
      <div className="relative h-[390px] sm:h-[560px] md:h-[600px] overflow-hidden">

        {/* Image absolute inset-0 bg-cover bg-center */}
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
          <div
            className="absolute inset-0 bg-neutral-900"
            aria-hidden
          />
        )}

        {/* Contenu relative z-10 — pt-24 pour ne pas coller au header */}
        <div className="relative z-10 max-w-4xl mx-auto text-center px-4 pt-24">

          {/* Ligne 1 — toujours blanc sur la page publique */}
          <h1 className="text-2xl sm:text-3xl font-medium text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
            {t("heroTitleWith")}
          </h1>

          {/* Ligne 2 — nom compagnie, toujours blanc */}
          <h2 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight truncate text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
            {companyName || t("ourCompany")}
          </h2>

          {/* Formulaire */}
          <form
            onSubmit={handleSubmit}
            className="mt-8 mx-auto max-w-3xl rounded-2xl bg-white/15 backdrop-blur-xl border border-white/20 shadow-2xl p-4 sm:p-5 md:p-6"
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