import React from "react";
import { ArrowRight, Bus } from "lucide-react";
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
      className="public-premium-card grid w-[29vw] min-w-[6.75rem] max-w-[8.5rem] shrink-0 grid-cols-1 gap-1.5 p-2 sm:w-44 sm:max-w-none sm:p-2.5"
    >
      <div className="min-w-0 flex-1 text-center">
        <div className="flex min-w-0 items-center justify-center gap-1 text-[11px] font-extrabold tracking-tight text-[var(--public-ink)] sm:text-sm">
          <span className="truncate">{trip.departure}</span>
          <ArrowRight className="h-3 w-3 shrink-0" style={{ color: primary }} />
          <span className="truncate">{trip.arrival}</span>
        </div>
        {trip.price !== undefined && (
          <div>
            <p className="truncate text-xs font-black tracking-tight sm:text-sm" style={{ color: primary }}>
              {money(trip.price)}
            </p>
          </div>
        )}
      </div>
      <button
        onClick={() => onSelect(trip.departure, trip.arrival)}
        className="public-premium-gradient flex min-h-7 w-full shrink-0 items-center justify-center rounded-lg px-2 text-center text-[10px] font-extrabold text-white shadow-sm transition-transform active:scale-95 sm:text-[11px]"
        aria-label={t("bookNow")}
      >
        {t("bookNow")}
      </button>
    </article>
  );

  return (
    <section className="public-premium-section">
      <div className="public-premium-container">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--public-primary-soft)] sm:h-11 sm:w-11 sm:rounded-2xl">
              <Bus size={21} style={{ color: primary }} />
            </div>
            <div className="min-w-0">
              <h2 className="public-premium-heading text-xl sm:text-2xl">
                {t("destinationsPopular")}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--public-muted)] sm:text-sm">
                {t("destinationsPopularSubtitle")}
              </p>
            </div>
          </div>
          {suggestions.length > 1 && (
            <span className="shrink-0 rounded-full border border-[var(--public-line)] bg-[var(--public-surface)] px-3 py-2 text-xs font-bold text-[var(--public-ink)] shadow-sm sm:px-4">
              {t("seeAll")}
            </span>
          )}
        </div>

        {loading ? (
          <div className="public-premium-card min-h-44 p-6">
            <div className="skeleton mb-4 h-5 w-2/3 rounded" />
            <div className="skeleton mb-6 h-8 w-1/2 rounded-full" />
            <div className="skeleton h-11 w-32 rounded-xl" />
          </div>
        ) : suggestions.length > 0 ? (
          <div className="public-premium-scroll-row">
            {suggestions.map((trip, index) => (
              <React.Fragment key={`${trip.departure}-${trip.arrival}-${index}`}>
                {renderTrip(trip)}
              </React.Fragment>
            ))}
          </div>
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
