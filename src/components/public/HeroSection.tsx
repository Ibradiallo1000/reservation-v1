import React from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRight } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Company } from '@/types/companyTypes';
import { useTranslation } from 'react-i18next';
import VilleCombobox from '@/components/public/VilleCombobox';
import { useVilleOptions } from '@/hooks/useVilleOptions';

interface HeroSectionProps {
  company: Company;
  onSearch: (departure: string, arrival: string) => void;
  isMobile?: boolean;
}

const HeroSection: React.FC<HeroSectionProps> = ({ company, onSearch }) => {
  const [departure, setDeparture] = React.useState('');
  const [arrival, setArrival] = React.useState('');
  const { t } = useTranslation();
  const villeOptions = useVilleOptions(company.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(departure.trim().toLowerCase(), arrival.trim().toLowerCase());
  };

  const couleurPrimaire = company.couleurPrimaire || '#3B82F6';

  return (
    <section className="relative w-full min-h-[600px] flex items-center justify-center overflow-hidden bg-gray-100">
      {company.banniereUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden">
          <LazyLoadImage
            src={company.banniereUrl}
            alt={`Bannière ${company.nom}`}
            className="w-full h-full object-cover object-center"
            effect="opacity"
            width="100%"
            height="100%"
            style={{ objectPosition: 'center center', minHeight: '100%', minWidth: '100%' }}
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute top-8 left-1/2 transform -translate-x-1/2 z-10"
      >
        <div className="text-white text-xl md:text-2xl font-semibold text-center">
          {company.accroche || t('defaultSlogan')}
        </div>
      </motion.div>

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
            <div className="w-full md:w-1/3">
              <VilleCombobox
                label={t('departureCity')}
                value={departure}
                onChange={setDeparture}
                options={villeOptions}
              />
            </div>

            <div className="w-full md:w-1/3">
              <VilleCombobox
                label={t('arrivalCity')}
                value={arrival}
                onChange={setArrival}
                options={villeOptions}
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