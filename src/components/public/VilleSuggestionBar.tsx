import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, MapPin, Star } from 'lucide-react';
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

  // Fonction pour déterminer si un trajet est "Top" (3 premiers)
  const isTopTrip = (index: number) => index < 3;

  return (
    <div className="py-12 px-4 md:px-8 bg-gradient-to-br from-white to-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* En-tête amélioré */}
        <div className="mb-10 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 flex justify-center items-center gap-2">
            <MapPin className="text-primary" size={24} style={{ color: couleurPrimaire }} />
            <span>Destinations populaires</span>
          </h2>
          <p className="text-sm md:text-base text-gray-500 mt-2">
            Réservez vos trajets en un seul clic — choisissez votre prochaine destination
          </p>
        </div>

        {/* Ligne de séparation stylisée */}
        <div 
          className="h-1 w-16 mx-auto rounded-full mb-10 opacity-90"
          style={{ backgroundColor: couleurPrimaire }}
        />

        {/* Grille de suggestions améliorée */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {suggestions.slice(0, 6).map((trip, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -5, scale: 1.02 }}
              transition={{ type: "spring", stiffness: 300 }}
              className="relative group"
            >

              <div 
                className="h-full flex flex-col bg-white rounded-xl border border-gray-200 p-4 cursor-pointer transition-all duration-200 hover:border-transparent hover:shadow-lg"
                style={{ 
                  borderLeft: `6px solid ${couleurSecondaire}`,
                }}
                onClick={() => onSelect(trip.departure, trip.arrival)}
              >
                <div className="flex items-start">
                  {/* Illustration SVG améliorée */}
                  <div className="relative mr-4 hidden md:block flex-shrink-0">
                    <svg 
                      width="64" 
                      height="40" 
                      viewBox="0 0 64 40"
                      className="text-gray-200"
                    >
                      <path 
                        d="M5,20 Q32,5 59,20" 
                        stroke="currentColor" 
                        strokeWidth="1.8" 
                        fill="none"
                        strokeDasharray="4,3"
                      />
                      <circle cx="5" cy="20" r="3.5" fill={couleurPrimaire} />
                      <circle cx="59" cy="20" r="3.5" fill={couleurPrimaire} />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center mb-2">
                      <h3 className="text-sm md:text-base font-semibold text-gray-900 truncate">
                        <span className="inline-block max-w-[120px] truncate">{trip.departure}</span>
                        <ArrowRight className="inline h-3.5 w-3.5 mx-1.5 text-gray-500" />
                        <span className="inline-block max-w-[120px] truncate">{trip.arrival}</span>
                      </h3>
                    </div>

                    {/* Détails supplémentaires */}
                    {trip.duration && (
                      <p className="text-xs text-gray-500 mb-3">
                        Durée: ~{trip.duration}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-auto">
                      {trip.price && (
                        <span 
                          className="text-2xs font-bold px-2.5 py-1 rounded-md"
                          style={{ 
                            backgroundColor: couleurSecondaire,
                            color: 'white'
                          }}
                        >
                          {trip.price.toLocaleString()} FCFA
                        </span>
                      )}

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="text-2xs font-semibold px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity"
                        style={{ 
                          backgroundColor: couleurPrimaire,
                          color: 'white'
                        }}
                      >
                        Réserver maintenant
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {suggestions.length > 6 && (
          <div className="text-center pt-8">
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="text-sm font-medium px-5 py-2.5 rounded-full border-2 hover:bg-gray-50 transition-all"
              style={{ 
                borderColor: couleurPrimaire,
                color: couleurPrimaire
              }}
            >
              + Voir plus de destinations
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VilleSuggestionBar;