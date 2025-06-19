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
    <section className="relative h-screen min-h-[600px] max-h-[1000px] flex items-center justify-center overflow-hidden">
      {/* Image de fond */}
      {company.banniereUrl && (
        <div className="absolute inset-0 z-0">
          <LazyLoadImage
            src={company.banniereUrl}
            alt={`Bannière ${company.nom}`}
            className="w-full h-full object-cover"
            effect="opacity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent" />
        </div>
      )}

      {/* Contenu */}
      <div className="relative z-10 w-full max-w-7xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-12"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 leading-tight">
            {company.accroche || "Réservez vos trajets facilement"}
          </h1>
          {company.instructionRecherche && (
            <p className="text-xl md:text-2xl text-white/90 mb-6 font-light max-w-2xl mx-auto">
              {company.instructionRecherche}
            </p>
          )}
        </motion.div>

        {/* Formulaire de recherche */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl shadow-2xl p-6 max-w-3xl mx-auto"
        >
          <div className="grid md:grid-cols-3 gap-4">
            <div className="relative">
              <label htmlFor="departure" className="sr-only">Ville de départ</label>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-white/80" />
              </div>
              <input
                id="departure"
                type="text"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                className="block w-full pl-10 pr-3 py-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
                placeholder="Ville de départ"
                required
              />
            </div>

            <div className="relative">
              <label htmlFor="arrival" className="sr-only">Ville d'arrivée</label>
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-white/80" />
              </div>
              <input
                id="arrival"
                type="text"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                className="block w-full pl-10 pr-3 py-4 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
                placeholder="Ville d'arrivée"
                required
              />
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className={`flex items-center justify-center gap-2 py-4 px-6 rounded-lg font-bold text-lg transition-all`}
              style={{
                backgroundColor: company.couleurPrimaire || '#3B82F6',
              }}
            >
              <Search className="h-5 w-5" />
              Rechercher
              <ArrowRight className="h-5 w-5" />
            </motion.button>
          </div>
        </motion.form>
      </div>

      {/* Scroll indicator */}
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
    </section>
  );
};

export default HeroSection;