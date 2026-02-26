import React from "react";
import { Bus } from "lucide-react";
import { Company, TripSuggestion } from "@/types/companyTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

interface Props {
  suggestions: TripSuggestion[];
  company: Company;
  onSelect: (departure: string, arrival: string) => void;
}

const VilleSuggestionBar: React.FC<Props> = ({
  suggestions,
  company,
  onSelect,
}) => {
  const money = useFormatCurrency();
  const primary = company.couleurPrimaire || "#2563eb";
  const secondary = company.couleurSecondaire || "#f3f4f6";

  const getFrequencyLabel = (days?: string[]) => {
    if (!days || days.length === 0) return "Horaires variables";
    if (days.length === 7) return "Départs quotidiens";
    return `${days.length} départs / semaine`;
  };

  return (
    <section className="px-3 pt-4 pb-6">
      <div className="max-w-5xl mx-auto">

        {/* ===== Titre ===== */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <Bus size={20} style={{ color: primary }} />
          <h2 className="text-lg font-bold text-black">
            Destinations populaires
          </h2>
        </div>

        {/* ===== Cartes ===== */}
        <div className="grid grid-cols-2 gap-4">

          {suggestions.slice(0, 4).map((trip, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-4 border transition-all duration-300 hover:-translate-y-1"
              style={{
                borderColor: `${primary}30`,
                boxShadow: `0 4px 15px ${primary}12`,
              }}
            >

              {/* Trajet */}
              <div className="font-semibold text-sm leading-snug">
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

              {/* Fréquence */}
              <div className="text-[11px] text-gray-500 mt-2">
                {getFrequencyLabel(trip.days)}
              </div>

              {/* Bouton */}
              <button
                onClick={() =>
                  onSelect(trip.departure, trip.arrival)
                }
                className="mt-4 w-full py-2 rounded-lg text-white text-sm font-semibold transition-all duration-300"
                style={{
                  background: `linear-gradient(90deg, ${primary}, ${secondary})`,
                }}
              >
                Réserver →
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default VilleSuggestionBar;
