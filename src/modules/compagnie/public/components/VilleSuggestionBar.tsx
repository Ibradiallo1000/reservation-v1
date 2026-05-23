import React from "react";
import { Bus } from "lucide-react";
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

  const primary = company.couleurPrimaire || "#2563eb";
  const secondary = company.couleurSecondaire || "#f3f4f6";

  return (
    <section className="relative bg-white dark:bg-gray-900 text-gray-900 dark:text-white -mt-8 px-3 pt-2 pb-6">
      <div className="max-w-5xl mx-auto">

        {/* TITRE */}
        <div className="text-center mb-6">
          <div className="flex justify-center items-center gap-2">
            <Bus size={18} style={{ color: primary }} />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
              {t("destinationsPopular")}
            </h2>
          </div>
        </div>

        {/* GRID */}
        <div className="grid grid-cols-3 gap-3">

          {/* LOADING */}
          {loading
            ? Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 bg-white p-3 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  style={{
                    backdropFilter: "blur(6px)",
                  }}
                >
                  <div className="h-3 w-2/3 mb-2 skeleton rounded" />
                  <div className="h-4 w-1/2 mb-2 skeleton rounded-full" />
                  <div className="h-8 w-full skeleton rounded-lg" />
                </div>
              ))

            : suggestions.slice(0, 6).map((trip, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-gray-200 bg-white p-3 text-center text-gray-900 transition-all duration-300 active:scale-95 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  style={{
                    backdropFilter: "blur(6px)",
                    boxShadow: `
                      0 4px 12px rgba(0,0,0,0.10),
                      0 2px 8px ${primary}15
                    `,
                  }}
                >

                  {/* TRAJET */}
                  <div className="text-xs font-semibold text-gray-900 leading-tight dark:text-white">
                    {trip.departure} →{" "}
                    <span style={{ color: primary }}>
                      {trip.arrival}
                    </span>
                  </div>

                  {/* PRIX */}
                  {trip.price !== undefined && (
                    <div
                      className="mt-2 text-[11px] font-bold px-2 py-1 rounded-full inline-block"
                      style={{
                        background: `linear-gradient(90deg, ${primary}15, ${secondary}40)`,
                        color: primary,
                      }}
                    >
                      {money(trip.price)}
                    </div>
                  )}

                  {/* POPULARITÉ */}
                  {trip.count !== undefined && (
                    <div className="text-[10px] text-gray-600 mt-1 dark:text-gray-300">
                      {trip.count} réservations
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    onClick={() =>
                      onSelect(trip.departure, trip.arrival)
                    }
                    className="mt-2 w-full h-8 rounded-lg text-[11px] font-semibold text-white transition-all"
                    style={{
                      background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                      boxShadow: `0 2px 8px ${primary}40`,
                    }}
                  >
                    {t("reserve")}
                  </button>
                </div>
              ))}
        </div>

        {/* EMPTY */}
        {!loading && suggestions.length === 0 && (
          <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-300">
            {offline
              ? "Connexion indisponible."
              : "Aucune destination disponible."}
          </div>
        )}
      </div>
    </section>
  );
};

export default VilleSuggestionBar;
