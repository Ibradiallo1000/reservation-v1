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
    <div className="py-8 px-4 md:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <MapPin className="mr-2" size={20} />
            Destinations populaires
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Réservez vos trajets en un clic
          </p>
        </div>

        {/* ✅ Responsive : 1 col mobile, 2 sur sm, 3 sur lg */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {suggestions.slice(0, 6).map((trip, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -2 }}
              className="relative group"
            >
              <div 
                className="flex items-center bg-white rounded-lg border border-gray-200 p-3 cursor-pointer transition-all duration-200 hover:border-transparent hover:shadow-md"
                style={{ 
                  borderLeft: `4px solid ${couleurPrimaire}`,
                }}
                onClick={() => onSelect(trip.departure, trip.arrival)}
              >
                {/* Mini illustration visible sur écran moyen+ */}
                <div className="relative mr-4 hidden md:block">
                  <svg 
                    width="60" 
                    height="40" 
                    viewBox="0 0 60 40"
                    className="text-gray-300"
                  >
                    <path 
                      d="M5,20 Q30,5 55,20" 
                      stroke="currentColor" 
                      strokeWidth="1.5" 
                      fill="none"
                      strokeDasharray="3,2"
                    />
                    <circle cx="5" cy="20" r="3" fill={couleurPrimaire} />
                    <circle cx="55" cy="20" r="3" fill={couleurPrimaire} />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center mb-1">
                    <h3 className="text-sm font-semibold text-gray-800 truncate">
                      {trip.departure}
                      <ArrowRight className="inline h-3 w-3 mx-1" />
                      {trip.arrival}
                    </h3>
                  </div>

                  <div className="flex items-center justify-between">
                    {trip.price && (
                      <span 
                        className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{ 
                          backgroundColor: couleurSecondaire,
                          color: couleurPrimaire
                        }}
                      >
                        {trip.price.toLocaleString()} FCFA
                      </span>
                    )}

                    <button
                      className="text-xs font-semibold px-2 py-1 rounded hover:opacity-90 transition-opacity"
                      style={{ 
                        backgroundColor: couleurPrimaire,
                        color: 'white'
                      }}
                    >
                      Réserver
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {suggestions.length > 6 && (
          <div className="text-center pt-6">
            <button
              className="text-sm font-medium px-4 py-2 rounded-full border hover:bg-gray-50 transition-colors"
              style={{ 
                borderColor: couleurPrimaire,
                color: couleurPrimaire
              }}
            >
              + Voir plus
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VilleSuggestionBar;
