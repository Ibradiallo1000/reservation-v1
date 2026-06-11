import React, { useState } from "react";
import {
  ArrowLeftRight,
  MapPin,
  Search,
} from "lucide-react";
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
    <section className="relative w-full pb-24 pt-14 sm:pb-32 sm:pt-16">
      <div className="relative h-[170px] overflow-hidden sm:h-[225px] lg:h-[250px]">
        {heroImageUrl && (
          <img
            src={heroImageUrl}
            className="absolute inset-0 h-full w-full object-cover"
            alt=""
          />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, black 58%, transparent) 0%, color-mix(in srgb, ${primaryColor} 24%, transparent) 58%, color-mix(in srgb, black 24%, transparent) 100%), linear-gradient(to top, white 0%, color-mix(in srgb, white 18%, transparent) 28%, color-mix(in srgb, black 18%, transparent) 70%)`,
          }}
        />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-center px-4 pb-11 pt-4 sm:px-6 sm:pb-14 sm:pt-5">
          <div className="max-w-[calc(100%-1rem)] text-white sm:max-w-2xl">
            <p
              className="mb-1 text-sm font-bold [text-shadow:0_2px_10px_rgba(0,0,0,0.8)] sm:text-base"
              style={{ color: "white" }}
            >
              {t("heroTitleMobile")}
            </p>
            <h1
              className="max-w-[20rem] break-words text-2xl font-black uppercase leading-tight tracking-[-0.035em] [text-shadow:0_2px_12px_rgba(0,0,0,0.9)] sm:max-w-xl sm:text-4xl sm:leading-none"
              style={{ color: "white" }}
            >
              {companyName}
            </h1>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="public-premium-card public-premium-search absolute bottom-16 left-1/2 z-30 w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 translate-y-1/2 p-3 sm:bottom-20 sm:w-[calc(100%-3rem)] sm:p-5"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] sm:gap-3">
          <div className="min-w-0 rounded-xl border border-[var(--public-line)] bg-white p-1.5 sm:rounded-2xl sm:p-2.5">
            <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-extrabold text-[var(--public-ink)] sm:px-2 sm:text-xs">
              <MapPin className="hidden h-3.5 w-3.5 shrink-0 sm:block" style={{ color: primaryColor }} />
              {t("departureCity")}
            </div>
            <VilleCombobox
              value={departure}
              onChange={setDeparture}
              placeholder={t("departureInputPlaceholder")}
              showLocationIcon
              wrapperClassName="min-w-0 rounded-lg px-0 py-0 sm:px-2 sm:py-1"
              inputClassName="min-w-0 text-[11px] font-medium text-[var(--public-ink)] sm:text-sm"
            />
          </div>

          <button
            type="button"
            onClick={handleSwap}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-[var(--public-line)] bg-white shadow-md transition-transform active:scale-95 sm:h-11 sm:w-11"
            style={{ color: primaryColor }}
            aria-label={t("swapCities")}
          >
            <ArrowLeftRight className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>

          <div className="min-w-0 rounded-xl border border-[var(--public-line)] bg-white p-1.5 sm:rounded-2xl sm:p-2.5">
            <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-extrabold text-[var(--public-ink)] sm:px-2 sm:text-xs">
              <MapPin className="hidden h-3.5 w-3.5 shrink-0 sm:block" style={{ color: secondaryColor }} />
              {t("arrivalCity")}
            </div>
            <VilleCombobox
              value={arrival}
              onChange={setArrival}
              placeholder={t("arrivalInputPlaceholder")}
              showLocationIcon
              wrapperClassName="min-w-0 rounded-lg px-0 py-0 sm:px-2 sm:py-1"
              inputClassName="min-w-0 text-[11px] font-medium text-[var(--public-ink)] sm:text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="public-premium-gradient public-premium-search-action mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold text-white transition-all enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 sm:mt-2.5 sm:min-h-14 sm:rounded-2xl sm:text-base"
        >
          <Search className="h-5 w-5" />
          {t("searchTrip")}
        </button>
      </form>
    </section>
  );
};

export default HeroCompanySection;
