import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TripSuggestionCard from './TripSuggestionCard';
import { TripSuggestion } from '@/types/companyTypes';

interface SuggestionsSliderProps {
  suggestedTrips: TripSuggestion[];
  colors: { primary: string };
  isMobile?: boolean;
}

const SuggestionsSlider: React.FC<SuggestionsSliderProps> = ({ suggestedTrips, colors }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // ⏱️ Défilement automatique
  useEffect(() => {
    if (suggestedTrips.length <= 3) return;

    const interval = setInterval(() => {
      if (!isPaused) {
        setActiveIndex((prev) => (prev + 1) % suggestedTrips.length);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [suggestedTrips.length, isPaused]);

  const handleTripClick = useCallback((trip: TripSuggestion) => {
    console.log('Trajet sélectionné:', trip);
    // TODO: navigation
  }, []);

  // ✅ Générer la pile de 3 suggestions
  const visibleTrips = Array.from({ length: 3 }, (_, i) => {
    const index = (activeIndex + i) % suggestedTrips.length;
    return suggestedTrips[index];
  });

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
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 flex flex-col gap-4"
        >
          {visibleTrips.map((trip, idx) => (
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
