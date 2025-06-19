import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ShieldCheck, Clock, Headphones, Car } from 'lucide-react';
import { hexToRgba } from '../../utils/color';

const services = [
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

export default function ServicesCarousel({ colors }: { colors: { primary: string } }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNav = (direction: 'prev' | 'next') => {
    setCurrentIndex(prev => {
      if (direction === 'prev') return prev === 0 ? services.length - 1 : prev - 1;
      else return prev === services.length - 1 ? 0 : prev + 1;
    });
  };

  useEffect(() => {
    const interval = setInterval(() => handleNav('next'), 5000);
    return () => clearInterval(interval);
  }, []);

  const currentService = services[currentIndex];
  const Icon = currentService.icon;

  return (
    <motion.section 
     className="mt-[-400px] px-4 pb-10 bg-gradient-to-b from-black/20 to-black/40"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-3">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
            Nos services exclusifs
          </h2>
          <div className="h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-transparent via-white to-transparent" />
        </div>

        <div className="relative h-[120px] md:h-[200px] overflow-hidden rounded-xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 p-6 flex flex-col justify-center backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-full" style={{ background: hexToRgba(colors.primary, 0.2) }}>
                  <Icon className="h-6 w-6" style={{ color: colors.primary }} />
                </div>
                <h3 className="text-xl font-semibold text-white">{currentService.title}</h3>
              </div>
              <p className="text-gray-300 text-sm md:text-base">
                {currentService.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex justify-center gap-4 mt-8">
          <button 
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
            onClick={() => handleNav('prev')}
          >
            <ChevronLeft className="h-5 w-5 text-white" />
          </button>

          <div className="flex items-center gap-2">
            {services.map((_, index) => (
              <button
                key={index}
                className={`w-3 h-3 rounded-full transition ${currentIndex === index ? 'bg-white w-6' : 'bg-white/30'}`}
                onClick={() => setCurrentIndex(index)}
              />
            ))}
          </div>

          <button 
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
            onClick={() => handleNav('next')}
          >
            <ChevronRight className="h-5 w-5 text-white" />
          </button>
        </div>
      </div>
    </motion.section>
  );
}
