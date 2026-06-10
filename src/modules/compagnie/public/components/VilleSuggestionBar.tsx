import React from "react";
import { ArrowRight, Bus, ChevronDown } from "lucide-react";
import { Company, TripSuggestion } from "@/types/companyTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useTranslation } from "react-i18next";

interface Props {
  suggestions: TripSuggestion[];
  loading?: boolean;
  offline?: boolean;
  company: Company;
  onSelect: (departure: string, arrival: string) => void;
}

const VilleSuggestionBar: React.FC<Props> = ({
  suggestions,
  loading = false,
  offline = false,
  company,
  onSelect,
}) => {
  const money = useFormatCurrency();
  const { t } = useTranslation();
  const primary = company.couleurPrimaire || "var(--public-primary)";

  const renderTrip = (trip: TripSuggestion) => (
    <article
      className="public-premium-card grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-4 sm:gap-5 sm:p-5"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-xl font-black tracking-tight text-[var(--public-ink)] sm:gap-2 sm:text-3xl">
          <span>{trip.departure}</span>
          <ArrowRight className="h-5 w-5 shrink-0 sm:h-6 sm:w-6" style={{ color: primary }} />
          <span>{trip.arrival}</span>
        </div>
        {trip.price !== undefined && (
          <div className="mt-1.5 sm:mt-2">
            <p className="text-xs font-semibold text-[var(--public-muted)] sm:text-sm">{t("fromPrice")}</p>
            <p className="text-2xl font-black tracking-tight sm:text-3xl" style={{ color: primary }}>
              {money(trip.price)}
            </p>
          </div>
        )}
      </div>
      <button
        onClick={() => onSelect(trip.departure, trip.arrival)}
        className="public-premium-gradient flex min-h-10 w-auto shrink-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold text-white shadow-md transition-transform active:scale-95 sm:min-h-12 sm:px-5 sm:text-sm"
      >
        {t("bookNow")}
        <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </button>
    </article>
  );

  return (
    <section className="public-premium-section pt-2 sm:pt-5">
      <div className="public-premium-container">
        <input id="public-destinations-toggle" type="checkbox" className="peer sr-only" />
        <div className="mb-3 flex items-center justify-between gap-2 sm:mb-5 sm:gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--public-primary-soft)] sm:h-11 sm:w-11 sm:rounded-2xl">
              <Bus size={21} style={{ color: primary }} />
            </div>
            <h2 className="public-premium-heading text-lg sm:text-2xl">
              {t("destinationsPopular")}
            </h2>
          </div>
          {suggestions.length > 1 && (
            <label
              htmlFor="public-destinations-toggle"
              className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-[var(--public-line)] bg-white px-3 py-2 text-xs font-bold text-[var(--public-ink)] shadow-sm sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm"
            >
              {t("seeMore")}
              <ChevronDown className="h-4 w-4 transition-transform peer-checked:rotate-180" style={{ color: primary }} />
            </label>
          )}
        </div>

        {loading ? (
          <div className="public-premium-card min-h-44 p-6">
            <div className="skeleton mb-4 h-5 w-2/3 rounded" />
            <div className="skeleton mb-6 h-8 w-1/2 rounded-full" />
            <div className="skeleton h-11 w-32 rounded-xl" />
          </div>
        ) : suggestions.length > 0 ? (
          <>
            {renderTrip(suggestions[0])}
            {suggestions.length > 1 && (
                <div id="more-destinations" className="mt-4 hidden gap-3 peer-checked:grid">
                  {suggestions.slice(1).map((trip, index) => (
                    <React.Fragment key={`${trip.departure}-${trip.arrival}-${index}`}>
                      {renderTrip(trip)}
                    </React.Fragment>
                  ))}
                </div>
            )}
          </>
        ) : (
          <div className="public-premium-card p-6 text-center text-sm text-[var(--public-muted)]">
            {offline ? "Connexion indisponible." : "Aucune destination disponible."}
          </div>
        )}
      </div>
    </section>
  );
};

export default VilleSuggestionBar;
