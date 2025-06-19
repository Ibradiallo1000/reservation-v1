// ✅ COMPOSANT : SuggestionsSlider
// Affiche une pile verticale animée de suggestions de trajets
// Défile automatiquement les suggestions disponibles toutes les quelques secondes

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TripSuggestionCard from './TripSuggestionCard';
import { TripSuggestion } from '@/types/companyTypes';

interface SuggestionsSliderProps {
  suggestedTrips: TripSuggestion[];
  colors: { primary: string };
}

const SuggestionsSlider: React.FC<SuggestionsSliderProps> = ({ suggestedTrips, colors }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⏱️ EFFET : fait défiler les suggestions automatiquement sauf si la souris est dessus
  useEffect(() => {
    if (suggestedTrips.length <= 1) return;

    const interval = setInterval(() => {
      if (!isPaused) {
        setActiveIndex((prev) => (prev + 1) % suggestedTrips.length);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [suggestedTrips.length, isPaused]);

  // ✅ GESTION : clic sur une carte (à personnaliser si besoin)
  const handleTripClick = useCallback((trip: TripSuggestion) => {
    console.log('Trajet sélectionné:', trip);
    // Vous pouvez ajouter une navigation ici vers la page de résultats
  }, []);

  return (
    <div
      className="relative h-[220px] overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      ref={containerRef}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 0.5 }}
          className="absolute inset-0 flex flex-col gap-4"
        >
          {suggestedTrips.slice(activeIndex, activeIndex + 3).map((trip, idx) => (
            <TripSuggestionCard
              key={`${activeIndex}-${idx}`}
              trip={trip}
              index={activeIndex + idx}
              onClick={() => handleTripClick(trip)}
              isActive={idx === 0}
            />
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default SuggestionsSlider;
