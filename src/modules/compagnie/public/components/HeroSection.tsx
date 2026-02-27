// src/modules/compagnie/public/components/HeroSection.tsx
import React from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import VilleCombobox from "@/shared/ui/VilleCombobox";

interface HeroSectionProps {
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  heroImageUrl?: string;
  onSearch: (departure: string, arrival: string) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({
  companyName,
  primaryColor,
  secondaryColor,
  heroImageUrl,
  onSearch,
}) => {
  const { t } = useTranslation();
  const [departure, setDeparture] = React.useState("");
  const [arrival, setArrival] = React.useState("");

  const submit = (e: React.FormEvent) => {
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

  return (
    <section className="relative w-full min-h-screen pt-[72px] overflow-hidden">
      {heroImageUrl ? (
        <>
          <img
            src={heroImageUrl}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/45" aria-hidden />
        </>
      ) : (
        <div className="absolute inset-0 bg-neutral-900" aria-hidden />
      )}

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10 md:py-16 text-center">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">
          {t("heroTitleWith")}
        </h1>
        <h2
          className="mt-1 text-3xl sm:text-4xl font-extrabold truncate text-[var(--teliya-secondary)]"
          style={
            {
              ["--teliya-secondary" as string]: secondaryColor,
            } as React.CSSProperties
          }
        >
          {companyName}
        </h2>

        <form
          onSubmit={submit}
          className="mt-5 mx-auto max-w-3xl rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md shadow-2xl p-5 md:p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={disabled}
                className="w-full min-h-[44px] inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white transition disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: disabled
                    ? "rgba(100,100,100,0.7)"
                    : secondaryColor,
                }}
              >
                <Search className="h-5 w-5 mr-2" style={{ color: primaryColor }} />
                {t("searchTrip")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};

export default HeroSection;
