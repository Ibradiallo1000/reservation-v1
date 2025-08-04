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

  return (
    <div className="px-4 md:px-8 mt-6">
      <div className="max-w-4xl mx-auto">
        {/* Titre */}
        <div className="mb-4 text-center">
          <h2 className="text-xl md:text-xl font-extrabold text-black flex justify-center items-center gap-2">
            <MapPin style={{ color: couleurPrimaire }} size={22} />
            <span>Nos destination</span>
          </h2>
        </div>

        {/* Scroll horizontal des suggestions */}
        <div className="flex space-x-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
          {suggestions.slice(0, 10).map((trip, index) => (
            <motion.div
              key={index}
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="min-w-[120px] bg-white rounded-lg shadow-md px-4 py-3 flex-shrink-0 cursor-pointer"
              style={{ borderLeft: `8px solid ${couleurSecondaire}` }}
              onClick={() => onSelect(trip.departure, trip.arrival)}
            >
              <div className="text-center">
                <div className="font-semibold text-gray-900 text-sm mb-1">
                  {trip.departure} → {trip.arrival}
                </div>
                {trip.price !== undefined && (
                  <div className="text-xs font-bold text-white inline-block px-3 py-1 rounded-full"
                    style={{ backgroundColor: couleurPrimaire }}>
                    {trip.price.toLocaleString()} FCFA
                  </div>
                )}
                <div className="mt-2">
                  <button
                    className="text-xs font-medium px-3 py-1.5 rounded-md text-white"
                    style={{ backgroundColor: couleurPrimaire }}
                  >
                    Réserver
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VilleSuggestionBar;
