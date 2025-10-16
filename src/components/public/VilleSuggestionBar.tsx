import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin } from 'lucide-react';
import { Company, TripSuggestion } from '@/types/companyTypes';

interface VilleSuggestionBarProps {
  suggestions: TripSuggestion[];
  company: Company;
  onSelect: (departure: string, arrival: string) => void;
}

const VilleSuggestionBar: React.FC<VilleSuggestionBarProps> = ({
  suggestions,
  company,
  onSelect,
}) => {
  const couleurPrimaire = company.couleurPrimaire || '#3b82f6';
  const couleurSecondaire = company.couleurSecondaire || '#e0f2fe';

  const formatPrice = (n?: number) =>
    typeof n === 'number' ? n.toLocaleString('fr-FR') : undefined;

  return (
    <div className="px-4 md:px-8 mt-6">
      <div className="max-w-4xl mx-auto">
        {/* Titre */}
        <div className="mb-4 text-center">
          <h2 className="text-xl md:text-xl font-extrabold text-black flex justify-center items-center gap-2">
            <MapPin style={{ color: couleurPrimaire }} size={22} />
            <span>Nos destinations</span>
          </h2>
        </div>

        {/* Scroll horizontal des suggestions */}
        <div className="flex space-x-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {suggestions.slice(0, 10).map((trip, index) => (
            <motion.button
              type="button"
              key={index}
              whileHover={{ scale: 1.04 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="min-w-[140px] bg-white rounded-xl shadow-sm px-4 py-3 flex-shrink-0 text-left border"
              style={{ borderColor: `${couleurSecondaire}` }}
              onClick={() => onSelect(trip.departure, trip.arrival)}
              aria-label={`Réserver ${trip.departure} vers ${trip.arrival}`}
            >
              <div className="font-semibold text-gray-900 text-sm">
                {trip.departure} → {trip.arrival}
              </div>

              {trip.price !== undefined && (
                <div
                  className="mt-1 inline-flex items-center text-xs font-bold text-white px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: couleurPrimaire }}
                >
                  {formatPrice(trip.price)} FCFA
                </div>
              )}

              <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium"
                   style={{ color: couleurPrimaire }}>
                <span>Réserver</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VilleSuggestionBar;
