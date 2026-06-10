import React, { useState } from "react";
import {
  ArrowLeftRight,
  Armchair,
  Clock3,
  MapPin,
  Search,
  ShieldCheck,
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

  const trustItems = [
    { label: t("security", { defaultValue: "Sécurité" }), icon: ShieldCheck },
    { label: t("punctuality", { defaultValue: "Ponctualité" }), icon: Clock3 },
    { label: t("comfort", { defaultValue: "Confort" }), icon: Armchair },
  ];

  return (
    <section className="relative w-full pb-20 sm:pb-32">
      <div className="relative h-[200px] overflow-hidden sm:h-[290px] lg:h-[320px]">
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
            background: `linear-gradient(90deg, color-mix(in srgb, black 64%, transparent) 0%, color-mix(in srgb, ${primaryColor} 28%, transparent) 48%, color-mix(in srgb, ${secondaryColor} 12%, transparent) 100%), linear-gradient(to top, color-mix(in srgb, black 76%, transparent) 0%, color-mix(in srgb, black 18%, transparent) 72%)`,
          }}
        />

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl items-end px-4 pb-14 pt-20 sm:px-6 sm:pb-14">
          <div className="max-w-[calc(100%-1rem)] text-white sm:max-w-2xl">
            <p
              className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.12em] [text-shadow:0_2px_3px_rgba(0,0,0,1),0_4px_14px_rgba(0,0,0,1)] sm:mb-1.5 sm:text-xs sm:tracking-[0.2em]"
              style={{ color: "white" }}
            >
              <span className="sm:hidden">{t("heroTitleMobile")}</span>
              <span className="hidden sm:inline">{t("heroTitleWith")}</span>
            </p>
            <h1
              className="max-w-[18rem] break-words text-xl font-black uppercase leading-tight tracking-[-0.035em] [text-shadow:0_2px_4px_rgba(0,0,0,1),0_5px_20px_rgba(0,0,0,1)] sm:max-w-xl sm:text-4xl sm:leading-none sm:tracking-[-0.045em] lg:text-5xl"
              style={{ color: "white" }}
            >
              {companyName}
            </h1>

            <div className="mt-3 hidden flex-wrap gap-2 sm:flex">
              {trustItems.map(({ label, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-2 rounded-full border border-white/35 bg-black/55 px-3 py-1.5 text-xs font-bold shadow-lg backdrop-blur-md"
                  style={{ color: "white" }}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="public-premium-card public-premium-search absolute -bottom-1 left-1/2 z-30 w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2 p-2 sm:w-[calc(100%-3rem)] sm:p-4"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-1.5 sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] sm:gap-3">
          <div className="min-w-0 rounded-xl border border-[var(--public-line)] bg-white p-1.5 sm:rounded-2xl sm:p-2.5">
            <div className="mb-0.5 flex items-center gap-1 px-1 text-[11px] font-extrabold text-[var(--public-ink)] sm:px-2 sm:text-xs">
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: primaryColor }} />
              {t("depart")}
            </div>
            <VilleCombobox
              value={departure}
              onChange={setDeparture}
              placeholder={t("depart")}
              showLocationIcon
              wrapperClassName="min-w-0 rounded-lg px-0 py-0 sm:px-2 sm:py-1"
              inputClassName="min-w-0 text-xs font-medium text-[var(--public-ink)] sm:text-sm"
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
              <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: secondaryColor }} />
              {t("arrival")}
            </div>
            <VilleCombobox
              value={arrival}
              onChange={setArrival}
              placeholder={t("arrival")}
              showLocationIcon
              wrapperClassName="min-w-0 rounded-lg px-0 py-0 sm:px-2 sm:py-1"
              inputClassName="min-w-0 text-xs font-medium text-[var(--public-ink)] sm:text-sm"
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
