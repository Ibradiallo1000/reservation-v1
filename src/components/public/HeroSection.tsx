import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Search, ArrowRight } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Company } from '@/types/companyTypes';
import { useTranslation } from 'react-i18next';

interface HeroSectionProps {
  company: Company;
  onSearch: (departure: string, arrival: string) => void;
  isMobile?: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({ company, onSearch }) => {
  const [departure, setDeparture] = React.useState('');
  const [arrival, setArrival] = React.useState('');
  const { t } = useTranslation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(departure, arrival);
  };

  const couleurPrimaire = company.couleurPrimaire || '#3B82F6';
  const couleurSecondaire = company.couleurSecondaire || '#E2E8F0';

  return (
    <section className="relative w-full min-h-[600px] flex items-center justify-center overflow-hidden bg-white">
      {/* ✅ Image de fond */}
      {company.banniereUrl && (
        <div className="absolute inset-0 z-0">
          <LazyLoadImage
            src={company.banniereUrl}
            alt={`Bannière ${company.nom}`}
            className="w-full h-full object-cover object-center"
            effect="opacity"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>
      )}

      {/* ✅ Accroche positionnée en haut */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10"
      >
        <div className="text-white text-base md:text-2xl font-semibold bg-black/40 px-6 py-2 rounded-full shadow-md">
          {company.accroche || t('defaultSlogan')}
        </div>
      </motion.div>

      {/* ✅ Formulaire de recherche */}
      <div className="relative z-10 w-full max-w-5xl px-5">
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg px-6 py-4 border-l-8"
          style={{ borderColor: couleurSecondaire }}
        >
          <p
            className="text-sm md:text-base font-semibold mb-4"
            style={{ color: couleurPrimaire }}
          >
            {company.instructionRecherche || t('searchInstruction')}
          </p>

          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="relative w-full md:w-1/3">
              <MapPin className="absolute left-3 top-3 text-gray-400 h-5 w-5" />
              <input
                type="text"
                required
                placeholder={t('departureCity')}
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="relative w-full md:w-1/3">
              <MapPin className="absolute left-3 top-3 text-gray-400 h-5 w-5" />
              <input
                type="text"
                required
                placeholder={t('arrivalCity')}
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <button
              type="submit"
              className="w-full md:w-auto px-5 py-2 rounded-md text-white font-semibold flex items-center justify-center gap-2"
              style={{ backgroundColor: couleurPrimaire }}
            >
              <Search className="h-4 w-4" />
              {t('searchTrip')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.form>
      </div>
    </section>
  );
};

export default HeroSection;
