// src/components/public/HeroSection.tsx  (version compagnie adaptée au style plateforme)
import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowLeftRight } from 'lucide-react';
import { Company } from '@/types/companyTypes';
import { useTranslation } from 'react-i18next';
import VilleCombobox from '@/components/public/VilleCombobox';
import { useVilleOptions } from '@/hooks/useVilleOptions';

interface HeroSectionProps {
  company: Company;
  onSearch: (departure: string, arrival: string) => void;
  isMobile?: boolean;
}

const FALLBACK_BG =
  'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1920&q=80';

const HeroSection: React.FC<HeroSectionProps> = ({ company, onSearch }) => {
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [spin, setSpin] = useState(false);
  const { t } = useTranslation();
  const villeOptions = useVilleOptions(company.id);

  const bannerRef = useRef<HTMLImageElement | null>(null);

  // Applique fetchpriority sans warning (via setAttribute)
  useEffect(() => {
    if (bannerRef.current) {
      try {
        bannerRef.current.setAttribute('fetchpriority', 'high');
      } catch {}
    }
  }, [company?.banniereUrl]);

  const couleurPrimaire = company.couleurPrimaire || '#FF6600';
  const accroche = company.accroche || t('defaultSlogan');
  const instruction = company.instructionRecherche || t('searchInstruction');

  const disabled =
    !departure.trim() ||
    !arrival.trim() ||
    departure.trim().toLowerCase() === arrival.trim().toLowerCase();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSearch(departure.trim(), arrival.trim());
  };

  const swapCities = () => {
    setSpin(true);
    setDeparture((d) => {
      const old = d;
      setArrival(old2 => (old2 = arrival));
      return arrival;
    });
    setArrival((a) => a); // déjà mis à jour ci-dessus
    setTimeout(() => setSpin(false), 280);
  };

  return (
    <section
      className="relative overflow-hidden text-white"
      style={{
        // 4 calques comme la page plateforme (verre sur image + voile + fallback + dégradé)
        backgroundImage: `
          linear-gradient(rgba(0,0,0,.62), rgba(0,0,0,.62)),
          url(${company.banniereUrl || ''}),
          url(${FALLBACK_BG}),
          linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%)
        `,
        backgroundSize: 'cover, cover, cover, cover',
        backgroundPosition: 'center, center, center, center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Si on a une bannière, on la charge “réelle” sous le même visuel */}
      {company.banniereUrl && (
        <img
          ref={bannerRef}
          src={company.banniereUrl}
          alt={`Bannière ${company.nom}`}
          className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
          width="100%"
          height="100%"
          decoding="async"
          loading="eager"
          {...({ fetchpriority: 'high' } as any)}
        />
      )}

      <div className="max-w-5xl mx-auto px-3 py-10 md:py-24 text-center">
        <h1 className="text-2xl md:text-6xl font-extrabold tracking-tight drop-shadow-[0_2px_8px_rgba(0,0,0,.5)]">
          {accroche}
        </h1>

        {/* Carte “verre” comme la plateforme */}
        <form
          onSubmit={handleSubmit}
          className="mt-4 mx-auto max-w-3xl rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-[0_16px_48px_rgba(0,0,0,.45)] p-5 md:p-6"
        >
          <p className="text-xs md:text-sm font-semibold uppercase text-orange-200 mb-3">
            {instruction}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Ville départ */}
            <div className="text-left">
              <p className="text-[11px] font-semibold uppercase text-orange-200 mb-1.5">
                {t('departureCity')}
              </p>
              <div className="rounded-xl border border-white/30 bg-white/85 text-gray-900 shadow-md focus-within:ring-2 focus-within:ring-orange-400/80">
                <VilleCombobox
                  value={departure}
                  onChange={setDeparture}
                  options={villeOptions}
                  placeholder={t('departureCity') as string} label={''}                />
              </div>
            </div>

            {/* Ville arrivée */}
            <div className="text-left">
              <p className="text-[11px] font-semibold uppercase text-orange-200 mb-1.5">
                {t('arrivalCity')}
              </p>
              <div className="rounded-xl border border-white/30 bg-white/85 text-gray-900 shadow-md focus-within:ring-2 focus-within:ring-orange-400/80">
                <VilleCombobox
                  value={arrival}
                  onChange={setArrival}
                  options={villeOptions}
                  placeholder={t('arrivalCity') as string} label={''}                />
              </div>
            </div>

            {/* Bouton rechercher */}
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={disabled}
                className={`w-full inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white shadow-[0_10px_20px_rgba(255,102,0,.35)] transition
                ${
                  disabled
                    ? 'bg-orange-300/70 cursor-not-allowed'
                    : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:brightness-110'
                }`}
                style={!disabled ? { backgroundImage: `linear-gradient(90deg, ${couleurPrimaire}, ${couleurPrimaire})` } : undefined}
              >
                <Search className="h-5 w-5 mr-2" />
                {t('searchTrip')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Dégradé en bas pour fondre avec la section suivante */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-28 bg-gradient-to-t from-black/55 to-transparent" />
    </section>
  );
};

export default HeroSection;
