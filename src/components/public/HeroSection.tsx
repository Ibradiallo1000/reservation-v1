import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Search, ArrowRight } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Company } from '@/types/companyTypes';

interface HeroSectionProps {
  company: Company;
  onSearch: (departure: string, arrival: string) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ company, onSearch }) => {
  const [departure, setDeparture] = React.useState('');
  const [arrival, setArrival] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(departure, arrival);
  };

  return (
    <section className="relative w-full min-h-[700px] md:min-h-[800px] flex items-center justify-center overflow-hidden">
      {/* ✅ Image de fond */}
      {company.banniereUrl && (
        <div className="absolute inset-0 z-0">
          <LazyLoadImage
            src={company.banniereUrl}
            alt={`Bannière ${company.nom}`}
            className="w-full h-full object-cover object-[center_60%]"
            effect="opacity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
        </div>
      )}

      {/* ✅ Contenu */}
      <div className="relative z-10 w-full max-w-6xl px-5 text-center">
        {/* ✅ Accroche */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-20 md:mb-10"
        >
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight">
            {company.accroche || 'Réservez vos trajets facilement'}
          </h1>
        </motion.div>

        {/* ✅ Formulaire + Instruction */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-xl shadow-[inset_0_1px_4px_rgba(255,255,255,0.1)] p-4 md:p-6 max-w-4xl mx-auto"
        >
          {company.instructionRecherche && (
            <p className="w-full text-base md:text-lg text-white/90 font-medium text-center mb-1 md:mb-2">
              {company.instructionRecherche}
            </p>
          )}

          <div className="flex flex-col md:flex-row w-full items-center gap-4">
            {/* Champ départ */}
            <div className="relative w-full md:w-1/3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-white/70" />
              </div>
              <input
                type="text"
                placeholder="Ville de départ"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                required
                className="pl-10 pr-3 py-3 w-full bg-white/10 border border-white/20 text-white rounded-lg placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>

            {/* Champ arrivée */}
            <div className="relative w-full md:w-1/3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-white/70" />
              </div>
              <input
                type="text"
                placeholder="Ville d'arrivée"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                required
                className="pl-10 pr-3 py-3 w-full bg-white/10 border border-white/20 text-white rounded-lg placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>

            {/* Bouton */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              type="submit"
              className="w-full md:w-auto px-6 py-3 rounded-lg font-bold text-white text-lg flex items-center justify-center gap-2"
              style={{ backgroundColor: company.couleurPrimaire || '#3B82F6' }}
            >
              <Search className="h-5 w-5" />
              Rechercher
              <ArrowRight className="h-5 w-5" />
            </motion.button>
          </div>
        </motion.form>
      </div>

      {/* ✅ Indicateur Scroll */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ repeat: Infinity, duration: 2 }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
      >
        <div className="h-8 w-5 border-2 border-white rounded-full flex justify-center">
          <motion.div
            animate={{ y: [0, 6] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="h-2 w-1 bg-white rounded-full mt-1"
          />
        </div>
      </motion.div>

      {/* ✅ Finition bas section */}
      <div className="absolute bottom-0 w-full h-12 bg-gradient-to-t from-[#0f172a] to-transparent z-10 rounded-t-3xl" />
    </section>
  );
};

export default HeroSection;
