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

  const getFrequencyLabel = (days?: string[]) => {
    if (!days || days.length === 0) return "";
    if (days.length === 7) return t("dailyDepartures");
    return t("departuresPerWeek", { count: days.length });
  };

  return (
    <section className="px-3 pt-4 pb-6">
      <div className="max-w-5xl mx-auto">
        {/* Titre : centré, icône Bus + texte, sobre, sans fond */}
        <div className="text-center mb-4">
          <div className="flex justify-center items-center gap-2">
            <Bus size={20} style={{ color: primary }} />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
              {t("destinationsPopular")}
            </h2>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="bg-white rounded-xl p-4 border border-gray-200"
                  style={{
                    borderColor: `${primary}20`,
                    boxShadow: `0 4px 15px ${primary}08`,
                  }}
                >
                  <div className="h-4 w-3/4 rounded skeleton mb-3" />
                  <div className="h-5 w-1/3 rounded-full skeleton mb-3" />
                  <div className="h-3 w-1/2 rounded skeleton mb-4" />
                  <div className="h-11 w-full rounded-lg skeleton" />
                </div>
              ))
            : suggestions.slice(0, 4).map((trip, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl p-4 border border-gray-200 text-center"
                  style={{
                    borderColor: `${primary}30`,
                    boxShadow: `0 4px 15px ${primary}12`,
                  }}
                >
                  {/* Trajet */}
                  <div className="font-semibold text-sm leading-snug text-gray-900">
                    {trip.departure} →{" "}
                    <span style={{ color: primary }}>
                      {trip.arrival}
                    </span>
                  </div>

                  {/* Prix */}
                  {trip.price !== undefined && (
                    <div
                      className="mt-3 inline-block text-xs font-bold px-3 py-1 rounded-full"
                      style={{
                        backgroundColor: `${secondary}20`,
                        color: primary,
                      }}
                    >
                      {money(trip.price)}
                    </div>
                  )}

                  {/* Fréquence (affichée seulement si connue) */}
                  {getFrequencyLabel(trip.days) && (
                    <div className="text-[11px] text-gray-500 mt-2">
                      {getFrequencyLabel(trip.days)}
                    </div>
                  )}

                  {/* Bouton */}
                  <button
                    onClick={() =>
                      onSelect(trip.departure, trip.arrival)
                    }
                    className="mt-4 w-full min-h-[44px] py-2 rounded-lg text-white text-sm font-semibold"
                    style={{
                      background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                    }}
                  >
                    {t("reserveNowArrow")}
                  </button>
                </div>
              ))}
        </div>
        {!loading && suggestions.length === 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-gray-300 bg-white/80 p-4 text-center">
            <p className="text-sm text-gray-700">
              {offline
                ? "Connexion indisponible : impossible de charger les destinations pour le moment."
                : "Aucune destination populaire disponible pour le moment."}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export default VilleSuggestionBar;
