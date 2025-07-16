import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, ChevronRight, ShieldCheck, Clock, Headphones, Car
} from 'lucide-react';
import { hexToRgba } from '../../utils/color';
import { useTranslation } from 'react-i18next';

export interface ServiceItem {
  icon: React.ElementType;
  title: string;
  description: string;
}

interface ServicesCarouselProps {
  services?: ServiceItem[];
  colors: { primary: string };
  isMobile?: boolean;
}

export default function ServicesCarousel({
  services,
  colors,
  isMobile
}: ServicesCarouselProps) {
  const { t } = useTranslation();

  const defaultServices: ServiceItem[] = [
    {
      icon: ShieldCheck,
      title: t('serviceSecurityTitle'),
      description: t('serviceSecurityDesc')
    },
    {
      icon: Clock,
      title: t('servicePunctualityTitle'),
      description: t('servicePunctualityDesc')
    },
    {
      icon: Headphones,
      title: t('serviceSupportTitle'),
      description: t('serviceSupportDesc')
    },
    {
      icon: Car,
      title: t('serviceComfortTitle'),
      description: t('serviceComfortDesc')
    }
  ];

  const finalServices = services && services.length > 0 ? services : defaultServices;

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNav = (direction: 'prev' | 'next') => {
    setCurrentIndex(prev =>
      direction === 'prev'
        ? prev === 0 ? finalServices.length - 1 : prev - 1
        : prev === finalServices.length - 1 ? 0 : prev + 1
    );
  };

  useEffect(() => {
    const interval = setInterval(() => handleNav('next'), 6000);
    return () => clearInterval(interval);
  }, [finalServices.length]);

  const currentService = finalServices[currentIndex];
  const Icon = currentService.icon;

  return (
    <motion.section
      className="px-4 py-10 bg-white relative overflow-hidden"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 bg-[url('/world-map.svg')] bg-center bg-cover opacity-5 pointer-events-none" />
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold mb-2 text-gray-900">
            {t('exclusiveServices')}
          </h2>
          <div
            className="h-1 w-16 mx-auto rounded-full"
            style={{ backgroundColor: colors.primary }}
          />
        </div>

        <div className="relative h-[180px] md:h-[200px] overflow-hidden rounded-xl border border-gray-200 shadow bg-white">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 p-4 flex flex-col justify-center text-center"
            >
              <div className="flex flex-col items-center gap-2 mb-3">
                <div
                  className="p-3 rounded-full"
                  style={{ background: hexToRgba(colors.primary, 0.1) }}
                >
                  <Icon className="h-6 w-6" style={{ color: colors.primary }} />
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-gray-900">{currentService.title}</h3>
              </div>
              <p className="text-gray-600 text-sm md:text-base max-w-xl mx-auto">
                {currentService.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-4 mt-6">
          <button
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition"
            onClick={() => handleNav('prev')}
            aria-label="Précédent"
          >
            <ChevronLeft className="h-4 w-4 text-gray-800" />
          </button>

          <div className="flex items-center gap-1">
            {finalServices.map((_, index) => (
              <button
                key={index}
                className={`h-2.5 rounded-full transition-all ${currentIndex === index ? 'bg-gray-800 w-5' : 'bg-gray-300 w-2.5'}`}
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
            <ChevronRight className="h-4 w-4 text-gray-800" />
          </button>
        </div>
      </div>
    </motion.section>
  );
}
