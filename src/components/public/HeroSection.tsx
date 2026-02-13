// src/components/public/HeroSection.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Search, Ticket } from 'lucide-react';
import { Company } from '@/types/companyTypes';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import VilleCombobox from '@/components/public/VilleCombobox';
import { useVilleOptions } from '@/modules/public/hooks/useVilleOptions';

interface HeroSectionProps {
  company: Company;
  onSearch: (departure: string, arrival: string) => void;
}

const FALLBACK_BG =
  'https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1920&q=80';

const HeroSection: React.FC<HeroSectionProps> = ({ company, onSearch }) => {
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const villeOptions = useVilleOptions(company.id);

  const bannerRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (bannerRef.current) {
      try {
        bannerRef.current.setAttribute('fetchpriority', 'high');
      } catch {}
    }
  }, [company?.banniereUrl]);

  const primary = company.couleurPrimaire || '#FF6600';
  const secondary = company.couleurSecondaire || '#FFD700';

  const accroche = company.accroche || t('defaultSlogan');

  const disabled =
    !departure.trim() ||
    !arrival.trim() ||
    departure.trim().toLowerCase() === arrival.trim().toLowerCase();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    onSearch(departure.trim(), arrival.trim());
  };

  return (
    <section
      className="relative overflow-hidden text-white pt-28 pb-20"
      style={{
        backgroundImage: `
          linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)),
          url(${company.banniereUrl || ''}),
          url(${FALLBACK_BG})
        `,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {company.banniereUrl && (
        <img
          ref={bannerRef}
          src={company.banniereUrl}
          alt={`Bannière ${company.nom}`}
          className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
          decoding="async"
          loading="eager"
        />
      )}

      <div className="max-w-5xl mx-auto px-4 text-center">

        {/* SLOGAN équilibré */}
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-extrabold leading-tight drop-shadow-lg">
          {accroche}
        </h1>

        {/* CARTE RECHERCHE */}
        <form
          onSubmit={handleSubmit}
          className="mt-12 mx-auto max-w-3xl rounded-2xl border border-white/30 bg-white/15 backdrop-blur-xl shadow-[0_20px_60px_rgba(0,0,0,.45)] p-6 md:p-8"
        >
          <p
            className="text-base md:text-lg font-semibold tracking-wide mb-6"
            style={{ color: secondary }}
          >
            Trouvez votre trajet
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            <div className="text-left">
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: secondary }}>
                {t('departureCity')}
              </p>
              <VilleCombobox
                value={departure}
                onChange={setDeparture}
                options={villeOptions}
                placeholder="Ex : Bamako"
              />
            </div>

            <div className="text-left">
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: secondary }}>
                {t('arrivalCity')}
              </p>
              <VilleCombobox
                value={arrival}
                onChange={setArrival}
                options={villeOptions}
                placeholder="Ex : Dakar"
              />
            </div>

            <div className="md:col-span-2 mt-2 space-y-4">

              {/* RECHERCHE (primaire) */}
              <button
                type="submit"
                disabled={disabled}
                className="w-full inline-flex items-center justify-center px-6 py-3 rounded-xl font-semibold text-white transition shadow-lg hover:brightness-110 disabled:opacity-60"
                style={{ backgroundColor: primary }}
              >
                <Search className="h-5 w-5 mr-2" />
                {t('searchTrip')}
              </button>

              {/* RETROUVER BILLET (secondaire distinct) */}
              <button
                type="button"
                onClick={() => navigate(`/${company.slug}/mes-reservations`)}
                className="w-full inline-flex items-center justify-center px-6 py-2.5 rounded-xl font-semibold transition shadow-md hover:brightness-110"
                style={{
                  backgroundColor: secondary,
                  color: '#000'
                }}
              >
                <Ticket className="h-4 w-4 mr-2" />
                Retrouver mon billet
              </button>

            </div>
          </div>
        </form>
      </div>

      <div className="pointer-events-none absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-black/40 to-transparent" />
    </section>
  );
};

export default HeroSection;
