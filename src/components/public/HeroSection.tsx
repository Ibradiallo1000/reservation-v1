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

  const isSecondaryDark = company.couleurSecondaire
    ? isDark(company.couleurSecondaire)
    : false;

  const inputBg = '#ffffff'; // force un fond clair
  const inputTextColor = '#1e293b'; // texte sombre
  const placeholderColor = '#334155'; // placeholder sombre

  return (
    <section className="relative w-full min-h-[700px] md:min-h-[500px] flex items-center justify-center overflow-hidden">
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

      <div className="relative z-10 w-full max-w-6xl px-5 text-center">
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

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex flex-col items-center justify-center gap-4 border border-white/10 rounded-xl shadow-lg p-4 md:p-6 max-w-4xl mx-auto"
          style={{
            backgroundColor: company.couleurSecondaire || '#F8FAFC'
          }}
        >
          {company.instructionRecherche && (
            <p className="w-full text-base md:text-lg font-medium text-center mb-1 md:mb-2 text-white">
              {company.instructionRecherche}
            </p>
          )}

          <div className="flex flex-col md:flex-row w-full items-center gap-4">
            <div className="relative w-full md:w-1/3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5" style={{ color: placeholderColor }} />
              </div>
              <input
                type="text"
                placeholder="Ville de départ"
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                required
                className="pl-10 pr-3 py-3 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: inputBg,
                  color: inputTextColor
                }}
              />
            </div>

            <div className="relative w-full md:w-1/3">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5" style={{ color: placeholderColor }} />
              </div>
              <input
                type="text"
                placeholder="Ville d'arrivée"
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                required
                className="pl-10 pr-3 py-3 w-full border border-gray-300 rounded-lg focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: inputBg,
                  color: inputTextColor
                }}
              />
            </div>

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

      <div className="absolute bottom-0 w-full h-12 bg-gradient-to-t from-[#0f172a] to-transparent z-10 rounded-t-3xl" />
    </section>
  );
};

function isDark(hex: string) {
  if (!hex) return false;
  const c = hex.substring(1);
  const rgb = parseInt(c, 16);
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = (rgb >> 0) & 0xff;
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luma < 140;
}

export default HeroSection;
