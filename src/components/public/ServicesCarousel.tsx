// ✅ src/components/public/ServicesCarousel.tsx

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, ShieldCheck, Clock, Headphones, Car
} from 'lucide-react';
import { hexToRgba } from '../../utils/color';

export interface ServiceItem {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface ServicesCarouselProps {
  services?: ServiceItem[]; // ✅ rend optionnel
  colors: { primary: string };
  isMobile?: boolean;
}

// ✅ fallback local si aucun service n'est passé
const defaultServices: ServiceItem[] = [
  {
    icon: ShieldCheck,
    title: 'Sécurité maximale',
    description: 'Véhicules contrôlés régulièrement et conducteurs professionnels pour votre sécurité.'
  },
  {
    icon: Clock,
    title: 'Ponctualité',
    description: 'Départs et arrivées à l’heure grâce à notre système de gestion optimisée.'
  },
  {
    icon: Headphones,
    title: 'Support 24/7',
    description: 'Notre équipe est disponible à tout moment pour répondre à vos questions.'
  },
  {
    icon: Car,
    title: 'Confort premium',
    description: 'Sièges spacieux, climatisation et WiFi à bord pour votre confort.'
  }
];

export default function ServicesCarousel({
  services = defaultServices, // ✅ fallback si undefined
  colors,
  isMobile
}: ServicesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNav = (direction: 'prev' | 'next') => {
    setCurrentIndex(prev =>
      direction === 'prev'
        ? prev === 0 ? services.length - 1 : prev - 1
        : prev === services.length - 1 ? 0 : prev + 1
    );
  };

  useEffect(() => {
    const interval = setInterval(() => handleNav('next'), 5000);
    return () => clearInterval(interval);
  }, [services.length]);

  const currentService = services[currentIndex];
  const Icon = currentService.icon;

  return (
    <motion.section
      className="px-4 py-16 bg-white relative overflow-hidden"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 bg-[url('/world-map.svg')] bg-center bg-cover opacity-5 pointer-events-none" />
      <div className="max-w-6xl mx-auto relative z-10">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-3 text-gray-900">
            Nos services exclusifs
          </h2>
          <div
            className="h-1 w-24 mx-auto rounded-full"
            style={{ backgroundColor: colors.primary }}
          />
        </div>

        <div className="relative h-[200px] md:h-[220px] overflow-hidden rounded-2xl border border-gray-200 shadow bg-white">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 p-6 flex flex-col justify-center text-center"
            >
              <div className="flex flex-col items-center gap-4 mb-4">
                <div
                  className="p-4 rounded-full"
                  style={{ background: hexToRgba(colors.primary, 0.1) }}
                >
                  <Icon className="h-8 w-8" style={{ color: colors.primary }} />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold text-gray-900">{currentService.title}</h3>
              </div>
              <p className="text-gray-600 text-base md:text-lg max-w-2xl mx-auto">
                {currentService.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-4 mt-8">
          <button
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition"
            onClick={() => handleNav('prev')}
            aria-label="Précédent"
          >
            <ChevronLeft className="h-5 w-5 text-gray-800" />
          </button>

          <div className="flex items-center gap-2">
            {services.map((_, index) => (
              <button
                key={index}
                className={`h-3 rounded-full transition-all ${currentIndex === index ? 'bg-gray-800 w-6' : 'bg-gray-300 w-3'}`}
                onClick={() => setCurrentIndex(index)}
                aria-label={`Service ${index + 1}`}
              />
            ))}
          </div>

          <button
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition"
            onClick={() => handleNav('next')}
            aria-label="Suivant"
          >
            <ChevronRight className="h-5 w-5 text-gray-800" />
          </button>
        </div>
      </div>
    </motion.section>
  );
}
