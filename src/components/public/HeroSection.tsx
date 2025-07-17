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
    <section className="relative w-full min-h-[600px] flex items-center justify-center overflow-hidden bg-gray-100">
      {/* ✅ Image de fond */}
      {company.banniereUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <div className="w-full h-full relative">
            <LazyLoadImage
              src={company.banniereUrl}
              alt={`Bannière ${company.nom}`}
              className="w-full h-full object-cover object-center"
              effect="opacity"
              width="100%"
              height="100%"
              style={{ objectPosition: 'center center', minHeight: '100%', minWidth: '100%' }}
            />
          </div>
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      {/* ✅ Accroche sans fond, bien centrée en haut */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10"
      >
        <div className="text-white text-xl md:text-2xl font-semibold">
          {company.accroche || t('defaultSlogan')}
        </div>
      </motion.div>

      {/* ✅ Formulaire transparent avec bordures blanches */}
      <div className="relative z-10 w-full max-w-5xl px-5">
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="bg-transparent rounded-xl border border-white px-6 py-4 backdrop-blur-md"
        >
          <p className="text-sm md:text-base font-semibold mb-4 text-white">
            {company.instructionRecherche || t('searchInstruction')}
          </p>

          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="relative w-full md:w-1/3">
              <MapPin className="absolute left-3 top-3 text-gray-200 h-5 w-5" />
              <input
                type="text"
                required
                placeholder={t('departureCity')}
                value={departure}
                onChange={(e) => setDeparture(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="relative w-full md:w-1/3">
              <MapPin className="absolute left-3 top-3 text-gray-200 h-5 w-5" />
              <input
                type="text"
                required
                placeholder={t('arrivalCity')}
                value={arrival}
                onChange={(e) => setArrival(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary"
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
