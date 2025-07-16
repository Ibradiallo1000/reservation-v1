import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Car } from 'lucide-react';
import { TripSuggestion } from '@/types/companyTypes';

interface TripSuggestionCardProps {
  trip: TripSuggestion;
  index: number;
  onClick?: () => void;
  isActive?: boolean;
}

/**
 * ✅ COMPOSANT : Carte de suggestion de trajet
 * Affiche un bloc cliquable pour un trajet suggéré
 * Props :
 * - trip : trajet à afficher (ville départ, arrivée, prix)
 * - index : position dans la liste (permet de varier le style)
 * - onClick : action à exécuter au clic
 * - isActive : permet de surligner le trajet actif
 */
const TripSuggestionCard: React.FC<TripSuggestionCardProps> = ({
  trip,
  index,
  onClick,
  isActive = false,
}) => {
  const cardStyle = index % 2 === 0 ? 'bg-white/10 hover:bg-white/15' : 'bg-white/5 hover:bg-white/10';

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
      className={`w-full p-4 rounded-xl shadow-md cursor-pointer flex items-center gap-4 backdrop-blur-md border border-white/20 transition-all duration-300 ${cardStyle}`}
      onClick={onClick}
      aria-label={`Trajet de ${trip.departure} à ${trip.arrival} pour ${trip.price} FCFA`}
    >
      <div className={`p-2 rounded-lg ${index % 2 === 0 ? 'bg-white/20' : 'bg-white/10'}`}>
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
    </motion.div>
  );
};

export default TripSuggestionCard;
