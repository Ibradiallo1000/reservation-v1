import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Car } from 'lucide-react';
import { TripSuggestion } from '@/types/companyTypes';

interface TripSuggestionCardProps {
  trip: TripSuggestion;
  index: number;
  onClick?: () => void;
  isActive?: boolean;
  format?: 'video' | 'square'; // ✅ ajout pour gérer 16:9 ou carré
}

const TripSuggestionCard: React.FC<TripSuggestionCardProps> = ({
  trip,
  index,
  onClick,
  isActive = false,
  format = 'video', // par défaut → 16:9
}) => {
  const cardStyle =
    index % 2 === 0
      ? 'bg-white/10 hover:bg-white/15'
      : 'bg-white/5 hover:bg-white/10';

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: isActive ? 1 : 0.8,
        y: 0,
        transition: { duration: 0.3 },
      }}
      className={`w-full rounded-xl shadow-md cursor-pointer flex flex-col overflow-hidden backdrop-blur-md border border-white/20 transition-all duration-300 ${cardStyle}`}
      onClick={onClick}
      aria-label={`Trajet de ${trip.departure} à ${trip.arrival} pour ${trip.price} FCFA`}
    >
      {/* ✅ IMAGE AVEC FORMAT */}
      {trip.imageUrl && (
        <div className={`${format === 'video' ? 'aspect-video' : 'aspect-square'} w-full`}>
          <img
            src={trip.imageUrl}
            alt={`${trip.departure} → ${trip.arrival}`}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="p-4 flex items-center gap-4">
        <div
          className={`p-2 rounded-lg ${
            index % 2 === 0 ? 'bg-white/20' : 'bg-white/10'
          }`}
        >
          <Car className="h-5 w-5 text-yellow-300" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-lg mb-1 truncate">
            {trip.departure} → {trip.arrival}
          </h3>
          <p className="text-sm text-yellow-300">
            à partir de {(trip.price ?? 0).toLocaleString()} FCFA
          </p>
        </div>

        <ArrowRight className="h-5 w-5 text-white/50" />
      </div>
    </motion.div>
  );
};

export default TripSuggestionCard;
