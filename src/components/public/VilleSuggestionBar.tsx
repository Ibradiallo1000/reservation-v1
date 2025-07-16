import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const couleurPrimaire = company.couleurPrimaire || '#3b82f6';
  const couleurSecondaire = company.couleurSecondaire || '#e0f2fe';

  return (
    <div className="py-8 px-4 md:px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <MapPin className="mr-2" size={20} />
            {t('popularDestinations')}
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {t('bookInOneClick')}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {suggestions.slice(0, 6).map((trip, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -2 }}
              className="relative group"
            >
              <div 
                className="flex items-center bg-white rounded-lg border border-gray-200 p-3 cursor-pointer transition-all duration-200 hover:border-transparent hover:shadow-md"
                style={{ borderLeft: `4px solid ${couleurSecondaire}` }}
                onClick={() => onSelect(trip.departure, trip.arrival)}
              >
                {/* Illustration de trajet */}
                <div className="relative mr-3 hidden md:block">
                  <svg width="60" height="40" viewBox="0 0 60 40" className="text-gray-300">
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
                  <h3 className="text-sm font-semibold text-gray-800 truncate mb-1">
                    {trip.departure}
                    <ArrowRight className="inline h-4 w-4 mx-2 text-gray-400" />
                    {trip.arrival}
                  </h3>

                  <div className="flex items-center justify-between">
                    <span 
                      className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{ 
                        backgroundColor: couleurSecondaire,
                        color: couleurPrimaire
                      }}
                    >
                      {(trip.price ?? 0).toLocaleString()} FCFA
                    </span>

                    <button
                      className="text-xs font-semibold px-2 py-1 rounded hover:opacity-90 transition-opacity"
                      style={{ 
                        backgroundColor: couleurPrimaire,
                        color: 'white'
                      }}
                    >
                      {t('bookNow')}
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
              {t('seeMore')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VilleSuggestionBar;
